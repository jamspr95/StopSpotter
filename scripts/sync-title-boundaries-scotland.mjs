#!/usr/bin/env node
// StopSpotter — Scotland title boundary sync (Registers of Scotland
// Cadastral Parcels, free/OGL-style, updated quarterly).
//
// ============================================================================
// IMPORTANT — READ BEFORE RELYING ON THIS IN PRODUCTION
// ============================================================================
// This originally used an Atom feed at
// https://ros.locationcentre.co.uk/internet/inspireAtomService.aspx, which
// turned out to be a dead domain (ENOTFOUND). The current site,
// https://ros-inspire.themapcloud.com/, is a client-rendered Next.js app
// (a county-select dropdown + Submit button), not a server-rendered page
// or a documented API — there's nothing to scrape in its HTML. Confirmed
// live (Oct 2026) by fetching its JS bundles and reading the minified
// source directly:
//   - The county list is a literal array baked into the JS bundle itself:
//     [{title:"Aberdeen",description:"Aberdeen Cadastral Parcels",code:"ABN"}, ...]
//     — 33 entries, one per Registration County. This script extracts
//     that array with a regex rather than re-deriving the list another
//     way, since it's the exact data the UI itself uses.
//   - The download it triggers is: fetch("/maps/download/ros-cp.cadastralparcel/" + code)
//     — a GeoServer-shaped path (matches the /maps/wms endpoint also on
//     this page) — serving a .zip. Unlike HMLR's England/Wales zip (one
//     .gml inside), RoS's actually contains an ESRI Shapefile: two
//     coordinate-system variants (<name>_bng.{shp,shx,dbf,prj} and
//     <name>_etrs89.{...}). scripts/lib/parcelExtraction.mjs always reads
//     the "_bng" set, reusing the same BNG->WGS84 pipeline HMLR's GML
//     uses, via scripts/lib/shapefileParcels.mjs. The .dbf field holding
//     the title/INSPIRE reference is a tolerant guess (dBASE field names
//     are commonly truncated to 10 characters) — unconfirmed against a
//     real file; it fails loudly with the first feature's actual
//     properties if none of the guesses hit.
// If the bundle's array shape or the download path ever changes, this
// fails loudly with a diagnostic (bundle byte count, whether the regex
// found anything) rather than silently loading nothing. Run --dry-run
// against one real county first and check the logged sample before
// trusting this on a schedule. See docs/SETUP.md §15.
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
import { extractParcelsFromBytes } from './lib/parcelExtraction.mjs'
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

// The exact literal shape confirmed in the real JS bundle (Oct 2026):
// {title:"Aberdeen",description:"Aberdeen Cadastral Parcels",code:"ABN"}
const COUNTY_ARRAY_PATTERN = /\{title:"([^"]+)",description:"[^"]*",code:"([^"]+)"\}/g
const DOWNLOAD_API_PATH = 'maps/download/ros-cp.cadastralparcel/'

async function fetchText(url) {
  const res = await fetchWithCookieJar(url, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`)
  return res.text()
}

async function findCountyLinks() {
  const html = await fetchText(DOWNLOAD_PAGE)
  const scriptSrcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))]
  const scriptTexts = await Promise.all(
    scriptSrcs.map(async (src) => {
      try {
        return await fetchText(src.startsWith('http') ? src : new URL(src, DOWNLOAD_PAGE).toString())
      } catch {
        return ''
      }
    }),
  )
  const combined = scriptTexts.join('\n')

  const links = [...combined.matchAll(COUNTY_ARRAY_PATTERN)].map((m) => ({
    name: m[1],
    href: new URL(DOWNLOAD_API_PATH + m[2], DOWNLOAD_PAGE).toString(),
  }))

  if (links.length === 0) {
    throw new Error(
      [
        `Parsed zero counties out of ${scriptSrcs.length} JS bundle(s) (${combined.length} bytes total) — the embedded county array's shape has changed from the confirmed {title:"...",description:"...",code:"..."} literal, or the page itself has changed. This needs a fresh look (see this script's header comment for how it was found last time), not a guess.`,
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
  const parcels = await extractParcelsFromBytes(buffer)

  console.log(`  parsed ${parcels.length} parcels`)
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
