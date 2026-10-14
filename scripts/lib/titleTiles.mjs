// StopSpotter — shared grid math for the on-demand title boundary lookup.
//
// Both build-title-tiles-{ew,scotland}.mjs (Node, this file) and
// supabase/functions/lookup-title-boundary (Deno, can't import a local
// Node file across that runtime boundary) need to compute the exact same
// ids for the exact same point, or a nomination's lookup would miss the
// tile its own title was written into. Every exported function below is
// intentionally tiny and dependency-free so it can be copied verbatim
// into the edge function rather than drifting out of sync — see that
// file's own top-of-file comment, which must be kept byte-for-byte
// identical to the copies here if any of them ever change.
//
// Grid choice: a plain WGS84 lat/lng degree grid, not the Ordnance Survey
// National Grid — the parsed parcel data is already WGS84 by the time it
// reaches this module (scripts/lib/bngToWgs84.mjs did that conversion
// upstream, same as it always has for the Postgres-upsert path), so a
// second coordinate system here would be pure overhead.
//
// Two grid sizes, for two different jobs — see docs/TITLE_BOUNDARY_API_PLAN.md
// "Phase 0" for the full reasoning:
//   - CELL_SIZE_DEG (0.1°, ~11km lat / 6-7km lng at UK latitudes): the fine
//     lookup grid. A tile's CONTENTS stay keyed by this, so the actual
//     point-in-polygon test at query time only ever scans one small fine
//     cell's worth of parcels, never a whole shard's.
//   - SHARD_SIZE_DEG (0.5°, FINE_CELLS_PER_SHARD=5 fine cells per side):
//     the file/release-asset boundary. A full-Great-Britain build at the
//     fine grid alone works out to roughly 3,000 individual tile files —
//     comfortably over GitHub Releases' 1,000-asset-per-release cap. The
//     original build-title-tiles.yml guarded against that by failing
//     loudly past 950 files rather than silently truncating, but hadn't
//     actually fixed it. Grouping 5x5 fine cells into one gzipped shard
//     file cuts that to roughly 128 files for all of Great Britain —
//     comfortably below the cap with real headroom — while each shard's
//     JSON still separates its fine cells internally (`cells: {...}`,
//     keyed by fine cell id), so fetching a shard doesn't mean scanning
//     every parcel in a 0.5° square to answer one point's lookup.

export const CELL_SIZE_DEG = 0.1
export const FINE_CELLS_PER_SHARD = 5
export const SHARD_SIZE_DEG = CELL_SIZE_DEG * FINE_CELLS_PER_SHARD

/** Must stay identical to the copy in supabase/functions/lookup-title-boundary/index.ts. */
export function cellIdForPoint(lat, lng) {
  const latBucket = Math.floor(lat / CELL_SIZE_DEG)
  const lngBucket = Math.floor(lng / CELL_SIZE_DEG)
  return `${latBucket}_${lngBucket}`
}

/**
 * Which shard file a fine cell id's tile data lives in — many fine cell
 * ids map to the same shard id. Must stay identical to the copy in
 * supabase/functions/lookup-title-boundary/index.ts.
 */
export function shardIdForCellId(cellId) {
  const [latBucket, lngBucket] = cellId.split('_').map(Number)
  const shardLatBucket = Math.floor(latBucket / FINE_CELLS_PER_SHARD)
  const shardLngBucket = Math.floor(lngBucket / FINE_CELLS_PER_SHARD)
  return `${shardLatBucket}_${shardLngBucket}`
}

/**
 * rings: array of rings, each ring an array of [lng, lat] pairs (the same
 * shape scripts/lib/titleBoundariesDb.mjs's ringToWkt already expects).
 * Returns every FINE cell id the rings' combined bounding box overlaps —
 * a parcel near a cell boundary is written into every cell it could
 * plausibly be queried from, not just the one its first point happens to
 * fall in. A little conservative (a parcel can end up listed in a
 * neighbouring cell it doesn't actually reach), which only costs a few
 * extra bytes in that neighbour's tile data — never a missed lookup,
 * which is the failure mode that actually matters here.
 */
export function cellIdsForRings(rings) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }
  }
  if (!Number.isFinite(minLat)) return []

  const minLatBucket = Math.floor(minLat / CELL_SIZE_DEG)
  const maxLatBucket = Math.floor(maxLat / CELL_SIZE_DEG)
  const minLngBucket = Math.floor(minLng / CELL_SIZE_DEG)
  const maxLngBucket = Math.floor(maxLng / CELL_SIZE_DEG)

  const ids = []
  for (let latBucket = minLatBucket; latBucket <= maxLatBucket; latBucket++) {
    for (let lngBucket = minLngBucket; lngBucket <= maxLngBucket; lngBucket++) {
      ids.push(`${latBucket}_${lngBucket}`)
    }
  }
  return ids
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

/** ~1.1m at the equator — real title parcel boundaries don't need more than this, and full double-precision BNG->WGS84 output (15+ significant digits) was pure wasted bytes at the scale a shard file gets fetched at. */
const COORDINATE_DECIMAL_PLACES = 6

function roundCoord(n) {
  return Math.round(n * 10 ** COORDINATE_DECIMAL_PLACES) / 10 ** COORDINATE_DECIMAL_PLACES
}

function readGzippedJson(filePath) {
  return readFile(filePath).then(
    (buf) => JSON.parse(gunzipSync(buf).toString('utf8')),
    (err) => {
      if (err.code === 'ENOENT') return null
      throw err
    },
  )
}

function writeGzippedJson(filePath, data) {
  return writeFile(filePath, gzipSync(Buffer.from(JSON.stringify(data))))
}

/**
 * Writes/merges parcels into gzipped per-shard tile files under
 * outDir/<nation>/<shardId>.json.gz. Called once per council/county (same
 * per-area iteration the existing sync-title-boundaries-*.mjs scripts
 * already use) rather than buffering a whole nation in memory first — a
 * full-country run holds one area's parcels at a time, same memory
 * profile as the proven Postgres-upsert path, just writing files instead
 * of upserting rows.
 *
 * Each shard file's shape is `{ cells: { "<fineCellId>": [feature, ...] } }`
 * — NOT a flat FeatureCollection — so a lookup that's already fetched and
 * decompressed a shard only needs `cells[fineCellId]`, not a scan of
 * every feature the whole 0.5° shard contains.
 *
 * Idempotent per title_number within a single build run: if two calls
 * for the same nation happen to touch the same fine cell (a parcel near
 * a council/county boundary), the later write's feature for a given
 * title_number replaces rather than duplicates the earlier one. This
 * does NOT merge across separate runs — each build starts from an empty
 * outDir (see build-title-tiles-{ew,scotland}.mjs), consistent with the
 * "rebuilt fresh from source each quarter, nothing kept between runs"
 * design in docs/TITLE_BOUNDARY_API_PLAN.md.
 *
 * parcels: [{ titleNumber, tenure, polygons }] — polygons as
 * cellIdsForRings() above (array of rings, each [lng, lat] pairs).
 * Returns the number of distinct shard files touched, for progress logging.
 */
export async function appendParcelsToTiles(outDir, nation, parcels) {
  // featuresByFineCell: fine cell id -> features destined for it. Grouped
  // by fine cell first (not shard) so that, further down, a feature only
  // ever needs writing into the ONE shard its fine cell belongs to.
  const featuresByFineCell = new Map()
  for (const p of parcels) {
    const feature = {
      type: 'Feature',
      properties: { title_number: p.titleNumber, tenure: p.tenure ?? null },
      // Always MultiPolygon, one member per ring — matches
      // titleBoundariesDb.mjs's polygonsToMultiPolygonWkt: these datasets
      // don't carry holes, so each ring is its own single-ring member.
      geometry: {
        type: 'MultiPolygon',
        coordinates: p.polygons.map((ring) => [ring.map(([lng, lat]) => [roundCoord(lng), roundCoord(lat)])]),
      },
    }
    for (const cellId of cellIdsForRings(p.polygons)) {
      if (!featuresByFineCell.has(cellId)) featuresByFineCell.set(cellId, [])
      featuresByFineCell.get(cellId).push(feature)
    }
  }

  // Now group those fine cells by shard, so each shard file is read/
  // merged/written exactly once per call even if several of its fine
  // cells got new features.
  const fineCellIdsByShard = new Map()
  for (const fineCellId of featuresByFineCell.keys()) {
    const shardId = shardIdForCellId(fineCellId)
    if (!fineCellIdsByShard.has(shardId)) fineCellIdsByShard.set(shardId, [])
    fineCellIdsByShard.get(shardId).push(fineCellId)
  }

  const dir = join(outDir, nation)
  await mkdir(dir, { recursive: true })

  for (const [shardId, fineCellIds] of fineCellIdsByShard) {
    const filePath = join(dir, `${shardId}.json.gz`)
    const existing = (await readGzippedJson(filePath)) ?? { cells: {} }

    for (const fineCellId of fineCellIds) {
      const existingFeatures = existing.cells[fineCellId] ?? []
      const byTitleNumber = new Map(existingFeatures.map((f) => [f.properties.title_number, f]))
      for (const f of featuresByFineCell.get(fineCellId)) byTitleNumber.set(f.properties.title_number, f)
      existing.cells[fineCellId] = [...byTitleNumber.values()]
    }

    await writeGzippedJson(filePath, existing)
  }

  return fineCellIdsByShard.size
}
