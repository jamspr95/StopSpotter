#!/usr/bin/env node
// StopSpotter — Scotland title boundary sync (Registers of Scotland
// Cadastral Parcels, free/OGL-style, updated quarterly).
//
// ============================================================================
// IMPORTANT — READ BEFORE RELYING ON THIS IN PRODUCTION
// ============================================================================
// Built in a sandboxed environment with no network access to ros.gov.uk,
// locationcentre.co.uk or themapcloud.com — there was no way to fetch a
// real feed or GML file and check this against it. What follows is
// confirmed from RoS's own published dataset metadata, not from fetching
// the feed itself:
//   - RoS publishes the same EU INSPIRE Cadastral Parcels schema as HMLR's
//     England/Wales dataset, per Registration County (33 of them), as
//     either CSV or an ATOM feed. This script uses the ATOM feed so it can
//     reuse the GML parsing already written and tested for England/Wales
//     (scripts/lib/inspireGml.mjs) — the CSV route was not built.
//   - ATOM feed: https://ros.locationcentre.co.uk/internet/inspireAtomService.aspx?id=KvuAI9BV6i4~
//   - INSPIRE Atom download services are commonly a FEED OF FEEDS (a
//     top-level feed lists per-dataset feeds, which in turn list the
//     actual per-county file links) rather than flat. This script handles
//     both shapes by following any <link type="application/atom+xml">
//     one level deep automatically — there was no way to confirm which
//     shape RoS actually uses without fetching it.
//   - File links might be gzip-compressed GML (.gml.gz) or a .zip archive
//     (confirmed this is what HMLR's England/Wales equivalent actually
//     does — see git history) — scripts/lib/inspireGml.mjs's
//     extractGmlTexts() detects either by magic bytes, not the file
//     extension, and unpacks every .gml/.xml entry inside a zip.
//   - Scotland's Land Register has no HMLR-style "freehold/leasehold"
//     tenure field, so tenure is always stored as null here — see
//     0015_title_boundaries.sql.
// As with the England/Wales script: run with --dry-run against one real
// county first and check the logged sample before trusting this on a
// schedule. See docs/SETUP.md §15.
// ============================================================================
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/sync-title-boundaries-scotland.mjs --all [--dry-run]
//   node scripts/sync-title-boundaries-scotland.mjs --county="Lanark" [--dry-run]
//   node scripts/sync-title-boundaries-scotland.mjs --dir=./downloads/scotland [--county="Lanark"] [--dry-run]
//
// --dir is the fallback/manual-verification path, same reasoning as the
// England/Wales script: download one or more county files yourself in a
// browser from https://ros-inspire.themapcloud.com/ (or the Atom feed
// link above), save them into a folder, then point this script at that
// folder instead of resolving the Atom feed live. See docs/SETUP.md §15.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { fetchWithCookieJar } from './lib/httpWithCookies.mjs'
import { describeGmlStructure, extractGmlTexts, findByLocalName, extractParcels } from './lib/inspireGml.mjs'
import { getServiceClient, upsertTitleBoundaries } from './lib/titleBoundariesDb.mjs'

const ATOM_FEED_URL = 'https://ros.locationcentre.co.uk/internet/inspireAtomService.aspx?id=KvuAI9BV6i4~'
const MIN_EXPECTED_COUNTIES = 25 // Scotland has 33 Registration Counties — fail loudly if far fewer entries were found
const MAX_FEED_DEPTH = 2 // follow a feed-of-feeds this many levels before giving up rather than looping forever
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

async function fetchText(url) {
  const res = await fetchWithCookieJar(url, { headers: { 'User-Agent': 'StopSpotter-title-boundary-sync (AireStop)' } })
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`)
  return res.text()
}

function entryTitle(entryNode) {
  const found = findByLocalName(entryNode, 'title')
  const t = found[0]
  return typeof t === 'string' ? t : (t?.['#text'] ?? 'Unnamed entry')
}

/**
 * Resolves an INSPIRE Atom download feed into a flat list of
 * { name, href } file links, transparently following one level of
 * feed-of-feeds nesting if the top-level feed turns out to list more
 * feeds rather than files directly.
 */
async function resolveAtomFeed(url, depth = 0, namePrefix = '') {
  const xml = await fetchText(url)
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' })
  const doc = parser.parse(xml)
  const entries = findByLocalName(doc, 'entry')

  const links = []
  for (const entry of entries) {
    const name = `${namePrefix}${entryTitle(entry)}`
    for (const link of findByLocalName(entry, 'link')) {
      const href = link?.['@_href']
      if (!href) continue
      const type = link?.['@_type'] ?? ''
      if (type.includes('atom+xml')) {
        if (depth >= MAX_FEED_DEPTH) {
          throw new Error(
            `Atom feed nesting exceeded ${MAX_FEED_DEPTH} levels at "${name}" — the feed shape is deeper than expected, needs a look.`,
          )
        }
        links.push(...(await resolveAtomFeed(href, depth + 1, `${name} / `)))
      } else {
        links.push({ name, href })
      }
    }
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
    console.log('Resolving the RoS INSPIRE Atom feed...')
    const links = await resolveAtomFeed(ATOM_FEED_URL)
    console.log(`Found ${links.length} links.`)
    if (!countyArg && links.length < MIN_EXPECTED_COUNTIES) {
      throw new Error(
        `Only found ${links.length} county links, expected ${MIN_EXPECTED_COUNTIES}+ — the feed's structure has likely changed (or needs another level of feed-of-feeds following), or it now requires a browser session the Atom feed can't provide (see docs/SETUP.md §15's --dir fallback) — not a partial run.`,
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
