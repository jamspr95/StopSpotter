#!/usr/bin/env node
// StopSpotter — SiteFinder raw candidate sync
//
// The receiving end of the staging/preview hand-off that replaces
// scripts/import-sitefinder-candidates.mjs's unconditional write straight
// into `nominations` (Jamie, 20 Oct 2026: "only approved sites need to
// enter [the] SS database"). SiteFinder's repo (jamspr95/sitefinder)
// produces to_raw_candidate_row() dicts (src/sitefinder/
// stopspotter_export.py), written out by scripts/run_pipeline.py's
// --stopspotter-raw-export flag. This script is the other half: point it
// at that JSON export and it upserts every candidate into
// site_finder_raw_candidates, where the new "SiteFinder search" admin
// screen (src/screens/admin/AdminSiteFinderSearchScreen.tsx) browses,
// filters, and maps them — admin_approve_site_finder_candidate is the
// only path from there into `nominations`.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/sync-sitefinder-raw-candidates.mjs path/to/raw-candidates.json
//
// Deliberately NOT a VITE_-prefixed env var — same reasoning as
// import-sitefinder-candidates.mjs's own header comment.
//
// Upsert, not insert/update-by-hand: every candidate is keyed by
// site_finder_candidate_id (site_finder_raw_candidates_candidate_id_idx,
// supabase/migrations/0024_site_finder_raw_candidates.sql's unique
// index), the same stable hash scheme as nominations.site_finder_candidate_id.
// A re-synced candidate (the same real site, scanned by a later pipeline
// run) updates that SAME row. Deliberately NEVER includes status,
// approved_nomination_id, rejected_reason, or reviewed_at in the upsert
// payload — Postgres' ON CONFLICT DO UPDATE only touches the columns
// actually given, so an admin's own triage decision on a candidate is
// never reset by a later sync; a fresh (never-synced) candidate still
// gets the right starting values from the table's own column defaults
// ('pending', null, null, null). last_synced_at IS always included, so a
// rejected/approved candidate's underlying data visibly goes stale vs.
// fresh even though its status itself never resets.

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const UPSERT_CHUNK_SIZE = 500

function toPointWKT(lat, lng) {
  return `SRID=4326;POINT(${lng} ${lat})`
}

// candidate.siteBoundary is a plain GeoJSON Polygon dict (never
// MultiPolygon — stopspotter_export.py's site_boundary_geojson() already
// reduced it to the largest single part) or null when the pipeline had
// no boundary for this candidate at all.
function toPolygonWKT(geometry) {
  if (!geometry || geometry.type !== 'Polygon') return null
  const rings = geometry.coordinates
    .map((ring) => ring.map(([lng, lat]) => `${lng} ${lat}`).join(', '))
    .map((ring) => `(${ring})`)
    .join(', ')
  return `SRID=4326;POLYGON(${rings})`
}

function candidateToColumns(candidate) {
  return {
    site_finder_candidate_id: candidate.site_finder_candidate_id,
    area_key: candidate.area_key,
    area_label: candidate.area_label,
    exact_location: toPointWKT(candidate.exact_lat, candidate.exact_lng),
    site_boundary: toPolygonWKT(candidate.site_boundary),
    owner_type: candidate.owner_type ?? null,
    owner_name: candidate.owner_name ?? null,
    property_name: candidate.property_name ?? null,
    ownership_confidence_detail: candidate.ownership_confidence_detail ?? null,
    ownership_source: candidate.ownership_source ?? null,
    score: candidate.score ?? null,
    component_scores: candidate.component_scores ?? {},
    flags: candidate.flags ?? [],
    reasons: candidate.reasons ?? [],
    usable_area_m2: candidate.usable_area_m2 ?? null,
    capacity_pitches: candidate.capacity_pitches ?? null,
    avg_slope_percent: candidate.avg_slope_percent ?? null,
    slope_source: candidate.slope_source ?? null,
    road_access: candidate.road_access ?? null,
    coast_distance_m: candidate.coast_distance_m ?? null,
    utility_status: candidate.utility_status ?? null,
    nearby: candidate.nearby ?? [],
    last_synced_at: new Date().toISOString(),
  }
}

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
}

async function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: node scripts/sync-sitefinder-raw-candidates.mjs <raw-candidates.json>')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never the VITE_ ones — see this file\'s header).')
    process.exit(1)
  }

  const candidates = JSON.parse(await readFile(path, 'utf8'))
  if (!Array.isArray(candidates)) {
    console.error('Expected a JSON array of to_raw_candidate_row() dicts (plus area_key/area_label).')
    process.exit(1)
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const rows = candidates.map(candidateToColumns)
  let synced = 0

  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const { error } = await client
      .from('site_finder_raw_candidates')
      .upsert(batch, { onConflict: 'site_finder_candidate_id' })
    if (error) throw error
    synced += batch.length
  }

  console.log(`Synced ${synced} candidate(s) into site_finder_raw_candidates.`)
  console.log('Review them in StopSpotter admin → SiteFinder search.')
}

await main()
