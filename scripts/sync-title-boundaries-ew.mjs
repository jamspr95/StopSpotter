#!/usr/bin/env node
// StopSpotter — England & Wales title boundary sync (HM Land Registry
// INSPIRE Index Polygons, free/OGL, updated ~monthly, no live API).
//
// ============================================================================
// IMPORTANT — READ BEFORE RELYING ON THIS IN PRODUCTION
// ============================================================================
// The GML feature/property names this script looks for are written to the
// INSPIRE Cadastral Parcels schema HMLR's documentation describes. This has
// now been run against the real download page and real council downloads
// (Oct 2026) and fixed twice already — see git history — but every
// council hasn't been checked individually, so "tolerant" (it searches by
// local element name, ignoring exact namespace prefixes, and tries several
// plausible property names for the title number) and FAILS LOUDLY (throws,
// doesn't silently write zero/partial rows) still matters. Run with
// --dry-run against --all (or a good handful of councils) before trusting
// a scheduled --all run unattended. See docs/SETUP.md §15.
// ============================================================================
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/sync-title-boundaries-ew.mjs --all [--dry-run]
//   node scripts/sync-title-boundaries-ew.mjs --council="Exeter" [--dry-run]
//   node scripts/sync-title-boundaries-ew.mjs --dir=./downloads/ew [--council="Exeter"] [--dry-run]
//
// Source: https://use-land-property-data.service.gov.uk/datasets/inspire/download
// lists a Local Authority table, each row's download link pointing at a
// .zip (one .gml inside), not a raw .gml as first assumed — confirmed
// against the real page. The council name is the row's <th>, not the
// link's own text (which just says "Download .gml"). There's no
// documented stable URL pattern or API (confirmed: the dataset's own
// catalogue entry says "API available: No"), so this scrapes the table
// for links rather than guessing filenames.
//
// The page also uses a cookie-walk redirect (a response sets a session
// cookie and redirects back to the same URL, expecting that cookie on the
// next request) rather than a login wall — scripts/lib/httpWithCookies.mjs
// handles that. --dir stays as a fallback for anything this doesn't fix (a
// genuine login wall, a page redesign) — download one or more council
// files yourself in a normal browser (they'll be .zip too), save them into
// a folder, then point this script at that folder instead of the download
// page; everything past "get the raw bytes" works identically either way.
// See docs/SETUP.md §15.
//
// The actual GML/zip extraction (shared with Scotland's sync script, which
// publishes the same INSPIRE Cadastral Parcels schema) lives in
// scripts/lib/inspireGml.mjs.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchWithCookieJar } from './lib/httpWithCookies.mjs'
import { extractGmlTexts, extractParcels } from './lib/inspireGml.mjs'
import { getServiceClient, upsertTitleBoundaries } from './lib/titleBoundariesDb.mjs'

const LOCAL_FILE_EXTENSIONS = ['.gml', '.gml.gz', '.zip', '.xml']

/** A manually-downloaded council file's name, minus whichever extension it has. */
function stripKnownExtension(filename) {
  const match = LOCAL_FILE_EXTENSIONS.find((ext) => filename.toLowerCase().endsWith(ext))
  return match ? filename.slice(0, -match.length) : filename
}

async function findLocalFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile() && LOCAL_FILE_EXTENSIONS.some((ext) => e.name.toLowerCase().endsWith(ext)))
  if (files.length === 0) {
    throw new Error(
      `No .gml/.gml.gz/.zip/.xml files found in ${dir} — check you saved the downloaded council file(s) there. See docs/SETUP.md §15.`,
    )
  }
  return files.map((e) => ({ name: stripKnownExtension(e.name), path: join(dir, e.name) }))
}

const DOWNLOAD_PAGE = 'https://use-land-property-data.service.gov.uk/datasets/inspire/download'
const MIN_EXPECTED_COUNCILS = 300 // England + Wales has ~380 local authorities — fail loudly if the page structure changed and far fewer links were found

async function findCouncilLinks() {
  const res = await fetchWithCookieJar(DOWNLOAD_PAGE, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
  if (!res.ok) throw new Error(`Failed to load the download page (${res.status})`)
  const html = await res.text()

  // Confirmed against the real page (Oct 2026): each Local Authority is one
  // table row — a <th scope="row"> holding the council name, followed by a
  // <td> whose <a href="...zip"> is the download link (its own link text
  // just says "Download .gml", not the council name). Matching across that
  // row boundary with a non-greedy [\s\S]*? is a heuristic, not a full HTML
  // parse, so it's still just a best-effort scrape of a page that's free to
  // change shape — which is the whole reason for the MIN_EXPECTED_COUNCILS
  // sanity check below rather than trusting any count silently.
  const rowPattern = /<th[^>]*scope="row"[^>]*>\s*([^<]+?)\s*<\/th>[\s\S]*?href="([^"]+?\.zip)"/gi
  const links = []
  let match
  while ((match = rowPattern.exec(html))) {
    const name = match[1].replace(/\s+/g, ' ').trim()
    const href = match[2].startsWith('http') ? match[2] : new URL(match[2], DOWNLOAD_PAGE).toString()
    if (name) links.push({ name, href })
  }

  // Confirmed live (Oct 2026): zero links here is always the scraper being
  // wrong about the page's current shape, never a legitimate "no councils
  // today" result — throwing with a preview of what was actually fetched
  // beats a downstream "no council matched X", which looked like the
  // wrong problem (a missing council) when the real one was an empty scrape.
  if (links.length === 0) {
    const allHrefs = [...html.matchAll(/<a[^>]+href="([^"]+)"/gi)].map((m) => m[1])
    const uniqueHrefs = [...new Set(allHrefs)]
    const zipIndex = html.search(/\.zip/i)
    throw new Error(
      [
        `Parsed zero council rows from the download page (${html.length} bytes of HTML) — the page's structure has changed again and this scraper's row regex needs updating, not a stale page.`,
        `Total <a href> tags found: ${allHrefs.length} (${uniqueHrefs.length} unique). Sample hrefs:`,
        ...uniqueHrefs.slice(0, 25).map((h) => `  ${h}`),
        zipIndex === -1
          ? 'No case-insensitive ".zip" substring found anywhere in the page at all.'
          : `First ".zip" mention, with context:\n${html.slice(Math.max(0, zipIndex - 400), zipIndex + 100)}`,
      ].join('\n'),
    )
  }
  return links
}

async function syncOneCouncil(client, name, getBytes, dryRun) {
  console.log(`Reading ${name}...`)
  const buffer = await getBytes()
  const gmlTexts = extractGmlTexts(buffer)

  const parcels = gmlTexts.flatMap(extractParcels)
  console.log(`  parsed ${parcels.length} parcels (from ${gmlTexts.length} GML file${gmlTexts.length === 1 ? '' : 's'})`)
  if (parcels.length === 0) {
    throw new Error(
      [
        `${name}: parsed zero parcels from a non-empty download — the parser's assumptions about HMLR's schema are likely wrong for this file. Stopping rather than silently loading nothing. See this script's header comment.`,
        `First GML file, first 2000 chars:`,
        gmlTexts[0]?.slice(0, 2000) ?? '(no GML text extracted)',
      ].join('\n'),
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
      getBytes: () => readFile(path),
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
      getBytes: async () => {
        const res = await fetchWithCookieJar(href, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
        if (!res.ok) throw new Error(`Failed to fetch ${name} (${res.status})`)
        return Buffer.from(await res.arrayBuffer())
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
  for (const { name, getBytes } of targets) {
    try {
      totalUpserted += await syncOneCouncil(client, name, getBytes, dryRun)
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
