#!/usr/bin/env node
// StopSpotter — SiteFinder candidate importer
//
// The receiving end of the "one shared targets table" integration
// (docs/PROJECT_PLAN.md "Relationship to the site finder",
// supabase/migrations/0013_site_finder_integration.sql). SiteFinder's own
// repo (jamspr95/sitefinder) produces `to_nomination_row()` dicts
// (src/sitefinder/stopspotter_export.py) — pure Python, no DB access of
// its own. This script is the other half: point it at a JSON export of
// those dicts and it inserts/merges them into this project's live
// `nominations` table.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/import-sitefinder-candidates.mjs path/to/candidates.json
//
// Deliberately NOT a VITE_-prefixed env var — those get bundled into the
// client build (see .env.example / docs/SETUP.md "Do not use the
// service_role key anywhere in this app"). This script runs standalone,
// by hand, never as part of the Vite build, so the service_role key never
// reaches a browser.
//
// Input: a JSON array of objects shaped like to_nomination_row()'s return
// value (snake_case keys — source, status, exact_lat/lng, public_lat/lng,
// place_type, owner_type, nearest_house, slope, room_for_five, nearby,
// water, pay_band, why_here, ownership_hint, site_finder_score,
// site_finder_component_scores, site_finder_flags, usable_area_m2,
// capacity_pitches, avg_slope_percent, slope_source, road_access,
// ownership_confidence_detail, coast_distance_m). How that JSON file gets
// produced (a SiteFinder-side script calling pipeline.run_area() +
// to_nomination_row() and dumping the list) is SiteFinder's own concern,
// not this one's — see that repo's integration/stopspotter/README.md.
//
// 200m match/merge (docs/PROJECT_PLAN.md point 4, "Matches merge"): for
// each candidate, find_nearby_nomination() (supabase/migrations/0001_init.sql)
// checks for an existing row within 200m before deciding insert vs merge.
//   - No match → insert a new source='site_finder' row, status='under_review'.
//   - Match on a source='site_finder' row → refresh in place (this is the
//     same candidate re-exported after a later SiteFinder pipeline run).
//     Every SiteFinder-owned field is overwritten with the latest scan;
//     status is left alone (an admin may already have triaged it).
//   - Match on a source='user' or 'both' row → merge: source becomes
//     'both', SiteFinder's own dedicated columns (site_finder_score and
//     friends) are always refreshed, but the human-form fields
//     (place_type, owner_type, nearest_house, slope, room_for_five, water,
//     pay_band, why_here, ownership_hint) are only ever filled in where
//     they're still null — a real human's own answer is never
//     overwritten by an automated scan. Location, status, criteria_score
//     and votes are untouched; they belong to the human nomination.

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MATCH_RADIUS_M = 200

const HUMAN_FORM_FIELDS = [
  'place_type',
  'owner_type',
  'nearest_house',
  'slope',
  'room_for_five',
  'water',
  'pay_band',
  'why_here',
  'ownership_hint',
]

const SITE_FINDER_FIELDS = [
  'site_finder_score',
  'site_finder_component_scores',
  'site_finder_flags',
  'usable_area_m2',
  'capacity_pitches',
  'avg_slope_percent',
  'slope_source',
  'road_access',
  'ownership_confidence_detail',
  'coast_distance_m',
]

function toWKT(lat, lng) {
  return `SRID=4326;POINT(${lng} ${lat})`
}

function candidateToColumns(c) {
  // 'submitted', not 'under_review' — AdminReviewScreen's swipe-triage
  // queue (src/screens/admin/AdminReviewScreen.tsx) only pulls
  // status==='submitted'; 'under_review' is what a swipe *moves a row
  // to*, not an entry point. A fresh candidate needs the same starting
  // status as a fresh human nomination (0001_init.sql's own default) so
  // it lands in the exact same queue — "everything after that is the
  // same admin pipeline as any nomination" only holds if it starts there too.
  const row = { source: 'site_finder', status: 'submitted' }
  for (const f of [...HUMAN_FORM_FIELDS, ...SITE_FINDER_FIELDS, 'nearby']) {
    row[f] = c[f] ?? null
  }
  row.exact_location = toWKT(c.exact_lat, c.exact_lng)
  row.public_location = toWKT(c.public_lat, c.public_lng)
  if (row.nearby == null) row.nearby = []
  if (row.site_finder_flags == null) row.site_finder_flags = []
  if (row.site_finder_component_scores == null) row.site_finder_component_scores = {}
  return row
}

async function importOne(client, candidate, log) {
  const point = { lat: candidate.exact_lat, lng: candidate.exact_lng }
  const { data: matches, error: matchError } = await client.rpc('find_nearby_nomination', {
    pt: toWKT(point.lat, point.lng),
    radius_m: MATCH_RADIUS_M,
  })
  if (matchError) throw matchError
  const match = matches?.[0] ?? null

  if (!match) {
    const { error } = await client.from('nominations').insert(candidateToColumns(candidate))
    if (error) throw error
    log.inserted++
    return
  }

  const { data: existing, error: fetchError } = await client
    .from('nominations')
    .select('id, source, ' + HUMAN_FORM_FIELDS.join(', '))
    .eq('id', match.id)
    .single()
  if (fetchError) throw fetchError

  if (existing.source === 'site_finder') {
    const refresh = candidateToColumns(candidate)
    delete refresh.status // admin triage state, if any, is preserved
    const { error } = await client.from('nominations').update(refresh).eq('id', match.id)
    if (error) throw error
    log.refreshed++
    return
  }

  // existing.source is 'user' or 'both' — merge, never clobbering a human answer.
  const update = { source: 'both' }
  for (const f of SITE_FINDER_FIELDS) update[f] = candidate[f] ?? null
  for (const f of HUMAN_FORM_FIELDS) {
    if (existing[f] == null && candidate[f] != null) update[f] = candidate[f]
  }
  const { error } = await client.from('nominations').update(update).eq('id', match.id)
  if (error) throw error
  log.merged++
}

async function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: node scripts/import-sitefinder-candidates.mjs <candidates.json>')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never the VITE_ ones — see this file\'s header).')
    process.exit(1)
  }

  const candidates = JSON.parse(await readFile(path, 'utf8'))
  if (!Array.isArray(candidates)) {
    console.error('Expected a JSON array of to_nomination_row() dicts.')
    process.exit(1)
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const log = { inserted: 0, merged: 0, refreshed: 0, failed: 0 }
  const failures = []

  for (const candidate of candidates) {
    try {
      await importOne(client, candidate, log)
    } catch (err) {
      log.failed++
      failures.push({ candidate: candidate.ownership_hint ?? candidate.exact_lat, error: err.message ?? String(err) })
    }
  }

  console.log(
    `Done: ${log.inserted} inserted, ${log.merged} merged into existing nominations (source='both'), ` +
      `${log.refreshed} refreshed, ${log.failed} failed.`,
  )
  if (failures.length > 0) {
    console.error('Failures:')
    for (const f of failures) console.error(`  ${JSON.stringify(f)}`)
    process.exit(1)
  }
}

await main()
