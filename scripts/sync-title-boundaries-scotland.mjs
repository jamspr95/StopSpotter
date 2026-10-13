#!/usr/bin/env node
// StopSpotter — Scotland title boundary sync (Registers of Scotland
// Cadastral Parcels, free/OGL-style, updated quarterly).
//
// ============================================================================
// IMPORTANT — READ BEFORE RELYING ON THIS IN PRODUCTION
// ============================================================================
// This originally used an Atom feed at
// https://ros.locationcentre.co.uk/internet/inspireAtomService.aspx — a
// live run against it failed with a DNS lookup error (`ENOTFOUND
// ros.locationcentre.co.uk`), and web search afterwards turned up that
// domain described as RoS's "older host", with
// https://ros-inspire.themapcloud.com/ as the current one. This script
// now scrapes that download page directly instead, the same way (and for
// the same reason) scripts/sync-title-boundaries-ew.mjs scrapes HMLR's —
// there's no documented stable URL/API for either. The exact link shape
// on that page is UNVERIFIED (no network access to check it from the
// environment this was written in); the scrape is deliberately tolerant
// and fails loudly with a diagnostic dump (unique hrefs found, a ".zip"/
// ".gml" context snippet) rather than guessing, mirroring the HMLR fix.
// Run --dry-run against one real county first and check the logged
// sample before trusting this on a schedule. See docs/SETUP.md §15.
// ============================================================================
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/sync-title-boundaries-scotland.mjs --all [--dry-run]
//   node scripts/sync-title-boundaries-scotland.mjs --county="Lanark" [--dry-run]
//   node scripts/sync-title-boundaries-scotland.mjs --dir=./downloads/scotland [--county="Lanark"] [--dry-run]
//
// File links might be gzip-compressed GML (.gml.gz) or a .zip archive
// (confirmed this is what HMLR's England/Wales equivalent actually does —
// see git history) — scripts/lib/inspireGml.mjs's extractGmlTexts()
// detects either by magic bytes, not the file extension, and unpacks
// every .gml/.xml entry inside a zip. Scotland's Land Register has no
// HMLR-style "freehold/leasehold" tenure field, so tenure is always
// stored as null here — see 0015_title_boundaries.sql.
//
// --dir is the fallback/manual-verification path, same reasoning as the
// England/Wales script: download one or more county files yourself in a
// browser from the download page above, save them into a folder, then
// point this script at that folder instead of fetching live. See
// docs/SETUP.md §15.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchWithCookieJar } from './lib/httpWithCookies.mjs'
import { describeGmlStructure, extractGmlTexts, extractParcels } from './lib/inspireGml.mjs'
import { getServiceClient, upsertTitleBoundaries } from './lib/titleBoundariesDb.mjs'

const DOWNLOAD_PAGE = 'https://ros-inspire.themapcloud.com/'
const MIN_EXPECTED_COUNTIES = 25 // Scotland has 33 Registration Counties — fail loudly if far fewer entries were found
const LOCAL_FILE_EXTENSIONS = ['.gml', '.gml.gz', '.zip', '.xml']

/** A manually-downloaded county file's name, minus whichever extension it has. */
function stripKnownExtension(filename) {
  const match = LOCAL_FILE_EXTENSIONS.find((ext) => filename.toLowerCase().endsWith(ext))
  return match ? filename.slice(0, -match.length) : filename
}

async function findLocalFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile() && LOCAL_FILE_EXTENSIONS.some((ext) => e.name.toLowerCase().endsWith(ext)))
  if (files.length === 0) {
    throw new Error(
      `No .gml/.gml.gz/.zip/.xml files found in ${dir} — check you saved the downloaded county file(s) there. See docs/SETUP.md §15.`,
    )
  }
  return files.map((e) => ({ name: stripKnownExtension(e.name), path: join(dir, e.name) }))
}

/** Any href ending in a file type this script knows how to read — tried in order of how likely each is given HMLR's own equivalent page. */
const FILE_LINK_PATTERN = /<a[^>]+href="([^"]+\.(?:zip|gml\.gz|gml|xml))"[^>]*>([^<]*)<\/a>/gi

async function findCountyLinks() {
  const res = await fetchWithCookieJar(DOWNLOAD_PAGE, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
  if (!res.ok) throw new Error(`Failed to load the download page (${res.status})`)
  const html = await res.text()

  const links = []
  let match
  while ((match = FILE_LINK_PATTERN.exec(html))) {
    const href = match[1].startsWith('http') ? match[1] : new URL(match[1], DOWNLOAD_PAGE).toString()
    // The link text might be the county name (like RoS's own page style)
    // or generic boilerplate (confirmed that's what HMLR's turned out to
    // be) — fall back to the filename itself, which is at least unique
    // and traceable, rather than an empty name.
    const text = match[2].replace(/\s+/g, ' ').trim()
    const name = text || decodeURIComponent(href.split('/').pop() || href)
    links.push({ name, href })
  }

  if (links.length === 0) {
    const allHrefs = [...html.matchAll(/<a[^>]+href="([^"]+)"/gi)].map((m) => m[1])
    const uniqueHrefs = [...new Set(allHrefs)]
    const hintIndex = html.search(/\.(zip|gml)/i)
    throw new Error(
      [
        `Parsed zero county file links from the download page (${html.length} bytes of HTML) — the page's structure isn't what was assumed and this scraper needs updating, not a stale page.`,
        `Total <a href> tags found: ${allHrefs.length} (${uniqueHrefs.length} unique). Sample hrefs:`,
        ...uniqueHrefs.slice(0, 25).map((h) => `  ${h}`),
        hintIndex === -1
          ? 'No case-insensitive ".zip"/".gml" substring found anywhere in the page at all.'
          : `First ".zip"/".gml" mention, with context:\n${html.slice(Math.max(0, hintIndex - 400), hintIndex + 100)}`,
      ].join('\n'),
    )
  }
  return links
}

async function fetchBytes(name, href) {
  const res = await fetchWithCookieJar(href, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
  if (!res.ok) throw new Error(`Failed to fetch ${name} (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

async function syncOneCounty(client, name, getBytes, dryRun) {
  console.log(`Reading ${name}...`)
  const buffer = await getBytes()
  const gmlTexts = extractGmlTexts(buffer)

  const parcels = gmlTexts.flatMap(extractParcels)
  console.log(`  parsed ${parcels.length} parcels (from ${gmlTexts.length} GML file${gmlTexts.length === 1 ? '' : 's'})`)
  if (parcels.length === 0) {
    throw new Error(
      [
        `${name}: parsed zero parcels from a non-empty file — the parser's assumptions about RoS's schema are likely wrong for this file. Stopping rather than silently loading nothing. See this script's header comment.`,
        gmlTexts[0] ? describeGmlStructure(gmlTexts[0]) : '(no GML text extracted)',
      ].join('\n'),
    )
  }
  console.log(`  sample: title ${parcels[0].titleNumber}, ${parcels[0].polygons[0].length} points`)

  if (dryRun) return 0

  return upsertTitleBoundaries(
    client,
    'scotland',
    parcels.map((p) => ({ titleNumber: p.titleNumber, tenure: null, polygons: p.polygons, sourceArea: name })),
    (done, total) => console.log(`  upserted ${done}/${total}`),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const countyArg = args.find((a) => a.startsWith('--county='))?.split('=')[1]
  const dirArg = args.find((a) => a.startsWith('--dir='))?.split('=')[1]
  const all = args.includes('--all')

  if (!countyArg && !all && !dirArg) {
    console.error(
      'Usage: node scripts/sync-title-boundaries-scotland.mjs --all | --county="Name" | --dir="./downloads/scotland" [--county="Name"] [--dry-run]',
    )
    process.exit(1)
  }

  const client = dryRun ? null : getServiceClient()

  // targets: [{ name, getBytes }] — getBytes fetches a live link or reads
  // a manually-downloaded local file, depending on --dir. Everything past
  // this point (zip/gzip detection, parsing, upserting) is identical either way.
  let targets
  if (dirArg) {
    console.log(`Reading county files from ${dirArg}...`)
    const files = await findLocalFiles(dirArg)
    console.log(`Found ${files.length} file(s).`)
    targets = files.map(({ name, path }) => ({ name, getBytes: () => readFile(path) }))
  } else {
    console.log('Finding county download links...')
    const links = await findCountyLinks()
    console.log(`Found ${links.length} links.`)
    if (!countyArg && links.length < MIN_EXPECTED_COUNTIES) {
      throw new Error(
        `Only found ${links.length} county links, expected ${MIN_EXPECTED_COUNTIES}+ — the download page's structure has likely changed and this scraper needs updating, not a partial run.`,
      )
    }
    targets = links.map(({ name, href }) => ({ name, getBytes: () => fetchBytes(name, href) }))
  }

  if (countyArg) {
    targets = targets.filter((t) => t.name.toLowerCase().includes(countyArg.toLowerCase()))
  }
  if (targets.length === 0) {
    throw new Error(`No county matched "${countyArg}".`)
  }

  let totalUpserted = 0
  const failures = []
  for (const { name, getBytes } of targets) {
    try {
      totalUpserted += await syncOneCounty(client, name, getBytes, dryRun)
    } catch (err) {
      console.error(`  FAILED (${name}): ${err.message}`)
      failures.push({ name, error: err.message })
    }
  }

  console.log(`Done. ${totalUpserted} rows upserted across ${targets.length - failures.length}/${targets.length} counties.`)
  if (failures.length > 0) {
    console.error(`${failures.length} counties failed:`, failures.map((f) => f.name).join(', '))
    process.exit(1)
  }
}

await main()
