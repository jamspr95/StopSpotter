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
// Matching (supabase/migrations/0022_site_finder_cluster_dedup.sql):
//   1. candidate.site_finder_candidate_id (a stable hash from
//      stopspotter_export.py - centroid+owner+property) is checked for an
//      EXACT match first. A hit means this is the same real site,
//      re-exported after a later SiteFinder pipeline run → refresh in
//      place. Every SiteFinder-owned field is overwritten with the latest
//      scan; status is left alone (an admin may already have triaged it).
//   2. No id match → fall back to find_nearby_nomination()'s 200m
//      proximity check, which now decides only two things:
//        - Match on a source='user' or 'both' row → merge: source becomes
//          'both', SiteFinder's own dedicated columns are always
//          refreshed, but the human-form fields (place_type, owner_type,
//          nearest_house, slope, room_for_five, water, pay_band, why_here,
//          ownership_hint) are only ever filled in where they're still
//          null — a real human's own answer is never overwritten by an
//          automated scan. Location, status, criteria_score and votes are
//          untouched; they belong to the human nomination.
//        - Match on a source='site_finder' row with NO id match → this is
//          a genuinely DIFFERENT real site that happens to be within
//          200m, not the same one re-scanned (real case, Edinburgh, 16
//          Oct 2026: two of 19 candidates were this close together and
//          got wrongly collapsed into one row before this fix existed).
//          Inserted as its own new row — never merged, never overwritten
//          — with cluster_root_id pointing at the other row, so both stay
//          independently visible to an admin while public_nominations
//          shows just one pin for the pair, in the general area.
//        - No match at all → plain insert, no cluster_root_id.

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

// Real incident (20 Oct 2026): every imported SiteFinder candidate had
// council_area = null — confirmed on the live table (17 real Edinburgh
// rows, none with a council area, while every source='user' row had a
// real one). candidateToColumns simply never set it; there's no column
// in HUMAN_FORM_FIELDS/SITE_FINDER_FIELDS that covers it, and nothing
// else in this script ever called council_area_for_point(), unlike
// useAppStore's resolveCouncilArea() on the app side, which every human
// nomination already goes through. Fixed by calling the same RPC this
// Node script's own service-role client already has access to. Falls
// back to null (not a guessed label — there's no equivalent of the
// app's client-side guessCouncilArea() available here) if the point
// doesn't land in any loaded boundary; the public view's own JS-side
// placeholder already covers a null council_area sensibly either way.
async function councilAreaForPoint(client, lat, lng) {
  const { data, error } = await client.rpc('council_area_for_point', { pt: toWKT(lat, lng) })
  if (error) throw error
  return data ?? null
}

async function candidateToColumns(client, c) {
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
  row.site_finder_candidate_id = c.site_finder_candidate_id ?? null
  row.exact_location = toWKT(c.exact_lat, c.exact_lng)
  row.public_location = toWKT(c.public_lat, c.public_lng)
  row.council_area = await councilAreaForPoint(client, c.exact_lat, c.exact_lng)
  if (row.nearby == null) row.nearby = []
  if (row.site_finder_flags == null) row.site_finder_flags = []
  if (row.site_finder_component_scores == null) row.site_finder_component_scores = {}
  return row
}

async function importOne(client, candidate, log) {
  const candidateId = candidate.site_finder_candidate_id ?? null

  // 1. Same real site, re-scanned by a later pipeline run? A stable id
  // match means yes, regardless of distance — refresh in place, same as
  // the old site_finder-vs-site_finder proximity match used to, but
  // without proximity ever risking a false positive against a genuinely
  // different nearby site.
  if (candidateId) {
    const { data: idMatches, error: idMatchError } = await client
      .from('nominations')
      .select('id')
      .eq('site_finder_candidate_id', candidateId)
      .limit(1)
    if (idMatchError) throw idMatchError
    const idMatch = idMatches?.[0] ?? null
    if (idMatch) {
      const refresh = await candidateToColumns(client, candidate)
      delete refresh.status // admin triage state, if any, is preserved
      const { error } = await client.from('nominations').update(refresh).eq('id', idMatch.id)
      if (error) throw error
      log.refreshed++
      return
    }
  }

  // 2. No id match — 200m proximity now only decides whether this
  // attaches to a human nomination, or is a genuinely new site (possibly
  // part of a cluster of nearby SiteFinder candidates, but never merged
  // into one row with another candidate).
  const point = { lat: candidate.exact_lat, lng: candidate.exact_lng }
  const { data: matches, error: matchError } = await client.rpc('find_nearby_nomination', {
    pt: toWKT(point.lat, point.lng),
    radius_m: MATCH_RADIUS_M,
  })
  if (matchError) throw matchError
  const match = matches?.[0] ?? null

  if (!match) {
    const { error } = await client.from('nominations').insert(await candidateToColumns(client, candidate))
    if (error) throw error
    log.inserted++
    return
  }

  const { data: existing, error: fetchError } = await client
    .from('nominations')
    .select('id, source, cluster_root_id, ' + HUMAN_FORM_FIELDS.join(', '))
    .eq('id', match.id)
    .single()
  if (fetchError) throw fetchError

  if (existing.source === 'site_finder') {
    // A DIFFERENT real site within 200m (its site_finder_candidate_id, if
    // it has one, didn't match ours — step 1 already ruled out "same
    // site"). Insert as its own fully visible row rather than clobbering
    // existing's data; cluster_root_id links the two so the public map
    // can still show just one pin for the pair, in the general area.
    const row = await candidateToColumns(client, candidate)
    row.cluster_root_id = existing.cluster_root_id ?? existing.id
    const { error } = await client.from('nominations').insert(row)
    if (error) throw error
    log.clustered++
    return
  }

  // existing.source is 'user' or 'both' — merge, never clobbering a human answer.
  const update = { source: 'both', site_finder_candidate_id: candidateId }
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
  const log = { inserted: 0, merged: 0, refreshed: 0, clustered: 0, failed: 0 }
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
      `${log.refreshed} refreshed, ${log.clustered} inserted as distinct sites near another SiteFinder candidate ` +
      `(grouped for the public map, still independent admin rows), ${log.failed} failed.`,
  )
  if (failures.length > 0) {
    console.error('Failures:')
    for (const f of failures) console.error(`  ${JSON.stringify(f)}`)
    process.exit(1)
  }
}

await main()
