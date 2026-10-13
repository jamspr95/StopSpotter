#!/usr/bin/env node
// StopSpotter — England & Wales title boundary sync (HM Land Registry
// INSPIRE Index Polygons, free/OGL, updated ~monthly, no live API).
//
// ============================================================================
// IMPORTANT — READ BEFORE RELYING ON THIS IN PRODUCTION
// ============================================================================
// The GML feature/property names this script looks for are written to the
// INSPIRE Cadastral Parcels schema HMLR's documentation describes, but
// this was built in a sandboxed environment with no network access to
// gov.uk — there was no way to download a real file and check the parser
// against it. The extraction is deliberately TOLERANT (it searches by
// local element name, ignoring exact namespace prefixes, and tries
// several plausible property names for the title number) and FAILS LOUDLY
// (throws, doesn't silently write zero/partial rows) rather than guessing
// — but "tolerant" isn't the same as "verified". Run with --dry-run
// against one real downloaded council file first; it logs what it found
// (feature count, a sample title number, a sample coordinate) without
// writing anything, specifically so that can be checked before this runs
// unattended on a schedule. See docs/SETUP.md §15.
// ============================================================================
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/sync-title-boundaries-ew.mjs --all [--dry-run]
//   node scripts/sync-title-boundaries-ew.mjs --council="Exeter" [--dry-run]
//   node scripts/sync-title-boundaries-ew.mjs --dir=./downloads/ew [--council="Exeter"] [--dry-run]
//
// Source: https://use-land-property-data.service.gov.uk/datasets/inspire/download
// lists one .gml download link per local authority — there's no documented
// stable URL pattern or API (confirmed: the dataset's own catalogue entry
// says "API available: No"), so this scrapes that page for links rather
// than guessing filenames. That page may require a free account/sign-in
// in a browser (unconfirmed from this environment — see docs/SETUP.md
// §15), which a plain unauthenticated fetch from a GitHub Actions runner
// can't do anything about. --dir is the fallback for that case, and the
// recommended way to test this against real data by hand before trusting
// the live scrape: download one or more council .gml files yourself in a
// normal browser (signing in if asked), save them into a folder, then
// point this script at that folder instead of the download page —
// everything past "get the GML text" works identically either way.
//
// The actual GML parsing (shared with Scotland's sync script, which
// publishes the same INSPIRE Cadastral Parcels schema) lives in
// scripts/lib/inspireGml.mjs.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { decompressIfGzip, extractParcels } from './lib/inspireGml.mjs'
import { getServiceClient, upsertTitleBoundaries } from './lib/titleBoundariesDb.mjs'

const GML_EXTENSIONS = ['.gml', '.gml.gz', '.xml']

/** A manually-downloaded council file's name, minus whichever GML-ish extension it has. */
function stripGmlExtension(filename) {
  const match = GML_EXTENSIONS.find((ext) => filename.toLowerCase().endsWith(ext))
  return match ? filename.slice(0, -match.length) : filename
}

async function findLocalFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile() && GML_EXTENSIONS.some((ext) => e.name.toLowerCase().endsWith(ext)))
  if (files.length === 0) {
    throw new Error(
      `No .gml/.gml.gz/.xml files found in ${dir} — check you saved the downloaded council file(s) there. See docs/SETUP.md §15.`,
    )
  }
  return files.map((e) => ({ name: stripGmlExtension(e.name), path: join(dir, e.name) }))
}

const DOWNLOAD_PAGE = 'https://use-land-property-data.service.gov.uk/datasets/inspire/download'
const MIN_EXPECTED_COUNCILS = 300 // England + Wales has ~380 local authorities — fail loudly if the page structure changed and far fewer links were found

async function findCouncilLinks() {
  const res = await fetch(DOWNLOAD_PAGE, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
  if (!res.ok) throw new Error(`Failed to load the download page (${res.status})`)
  const html = await res.text()

  // Heuristic, not a CSS-selector scrape: any <a href="...gml..."> on the
  // page, paired with its link text as the council name. Chosen to survive
  // a page redesign better than exact class/structure matching would —
  // still just a best-effort scrape of a page that's free to change shape,
  // which is the whole reason for the MIN_EXPECTED_COUNCILS sanity check
  // below rather than trusting any count silently.
  const linkPattern = /<a[^>]+href="([^"]+\.gml[^"]*)"[^>]*>([^<]+)<\/a>/gi
  const links = []
  let match
  while ((match = linkPattern.exec(html))) {
    const href = match[1].startsWith('http') ? match[1] : new URL(match[1], DOWNLOAD_PAGE).toString()
    const name = match[2].replace(/\s+/g, ' ').trim()
    if (name) links.push({ name, href })
  }
  return links
}

async function syncOneCouncil(client, name, getText, dryRun) {
  console.log(`Reading ${name}...`)
  const gmlText = await getText()

  const parcels = extractParcels(gmlText)
  console.log(`  parsed ${parcels.length} parcels`)
  if (parcels.length === 0) {
    throw new Error(
      `${name}: parsed zero parcels from a non-empty GML file — the parser's assumptions about HMLR's schema are likely wrong for this file. Stopping rather than silently loading nothing. See this script's header comment.`,
    )
  }
  console.log(`  sample: title ${parcels[0].titleNumber}, ${parcels[0].polygons[0].length} points`)

  if (dryRun) return 0

  return upsertTitleBoundaries(
    client,
    'england_wales',
    parcels.map((p) => ({ titleNumber: p.titleNumber, tenure: 'freehold', polygons: p.polygons, sourceArea: name })),
    (done, total) => console.log(`  upserted ${done}/${total}`),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const councilArg = args.find((a) => a.startsWith('--council='))?.split('=')[1]
  const dirArg = args.find((a) => a.startsWith('--dir='))?.split('=')[1]
  const all = args.includes('--all')

  if (!councilArg && !all && !dirArg) {
    console.error(
      'Usage: node scripts/sync-title-boundaries-ew.mjs --all | --council="Name" | --dir="./downloads/ew" [--council="Name"] [--dry-run]',
    )
    process.exit(1)
  }

  const client = dryRun ? null : getServiceClient()

  // targets: [{ name, getText }] — getText fetches a live link or reads a
  // manually-downloaded local file, depending on --dir. Everything past
  // this point (parsing, upserting, error handling) is identical either way.
  let targets
  if (dirArg) {
    console.log(`Reading council files from ${dirArg}...`)
    const files = await findLocalFiles(dirArg)
    console.log(`Found ${files.length} file(s).`)
    targets = files.map(({ name, path }) => ({
      name,
      getText: async () => decompressIfGzip(await readFile(path)),
    }))
  } else {
    console.log('Finding council download links...')
    const links = await findCouncilLinks()
    console.log(`Found ${links.length} links.`)
    if (!councilArg && links.length < MIN_EXPECTED_COUNCILS) {
      throw new Error(
        `Only found ${links.length} council links, expected ${MIN_EXPECTED_COUNCILS}+ — the download page's structure has likely changed (it may now require signing in — see docs/SETUP.md §15's --dir fallback) and this scraper needs updating, not a partial run.`,
      )
    }
    targets = links.map(({ name, href }) => ({
      name,
      getText: async () => {
        const res = await fetch(href, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
        if (!res.ok) throw new Error(`Failed to fetch ${name} (${res.status})`)
        return res.text()
      },
    }))
  }

  if (councilArg) {
    targets = targets.filter((t) => t.name.toLowerCase().includes(councilArg.toLowerCase()))
  }
  if (targets.length === 0) {
    throw new Error(`No council matched "${councilArg}".`)
  }

  let totalUpserted = 0
  const failures = []
  for (const { name, getText } of targets) {
    try {
      totalUpserted += await syncOneCouncil(client, name, getText, dryRun)
    } catch (err) {
      console.error(`  FAILED (${name}): ${err.message}`)
      failures.push({ name, error: err.message })
    }
  }

  console.log(`Done. ${totalUpserted} rows upserted across ${targets.length - failures.length}/${targets.length} councils.`)
  if (failures.length > 0) {
    console.error(`${failures.length} councils failed:`, failures.map((f) => f.name).join(', '))
    process.exit(1)
  }
}

await main()
