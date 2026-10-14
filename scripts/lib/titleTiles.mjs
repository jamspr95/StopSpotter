// StopSpotter — shared grid math for the on-demand title boundary lookup.
//
// Both build-title-tiles-{ew,scotland}.mjs (Node, this file) and
// supabase/functions/lookup-title-boundary (Deno, can't import a local
// Node file across that runtime boundary) need to compute the exact same
// cell id for the exact same point, or a nomination's lookup would miss
// the tile its own title was written into. CELL_SIZE_DEG and
// cellIdForPoint() are intentionally tiny and dependency-free so they can
// be copied verbatim into the edge function rather than drifting out of
// sync — see that function's own top-of-file comment, which must be kept
// byte-for-byte identical to the two functions here if either ever
// changes.
//
// Grid choice: a plain WGS84 lat/lng degree grid, not the Ordnance Survey
// National Grid — the parsed parcel data is already WGS84 by the time it
// reaches this module (scripts/lib/bngToWgs84.mjs did that conversion
// upstream, same as it always has for the Postgres-upsert path), so a
// second coordinate system here would be pure overhead. 0.1 degrees is
// roughly 11km of latitude and 6-7km of longitude at the UK's latitudes —
// close enough to the "~10km" grid described in docs/TITLE_BOUNDARY_API_PLAN.md
// without needing proj4/BNG math a second time.

export const CELL_SIZE_DEG = 0.1

/** Must stay identical to the copy in supabase/functions/lookup-title-boundary/index.ts. */
export function cellIdForPoint(lat, lng) {
  const latBucket = Math.floor(lat / CELL_SIZE_DEG)
  const lngBucket = Math.floor(lng / CELL_SIZE_DEG)
  return `${latBucket}_${lngBucket}`
}

/**
 * rings: array of rings, each ring an array of [lng, lat] pairs (the same
 * shape scripts/lib/titleBoundariesDb.mjs's ringToWkt already expects).
 * Returns every cell id the rings' combined bounding box overlaps — a
 * parcel near a cell boundary is written into every cell it could
 * plausibly be queried from, not just the one its first point happens to
 * fall in. A little conservative (a parcel can end up listed in a
 * neighbouring cell it doesn't actually reach), which only costs a few
 * extra bytes in that neighbour's tile file — never a missed lookup,
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

/**
 * Writes/merges parcels into per-cell GeoJSON files under outDir/<nation>/.
 * Called once per council/county (same per-area iteration the existing
 * sync-title-boundaries-*.mjs scripts already use) rather than buffering a
 * whole nation in memory first — a full-country run holds one area's
 * parcels at a time, same memory profile as the proven Postgres-upsert
 * path, just writing files instead of upserting rows.
 *
 * Idempotent per title_number within a single build run: if two calls
 * for the same nation happen to touch the same cell (a parcel near a
 * council/county boundary), the later write's feature for a given
 * title_number replaces rather than duplicates the earlier one. This
 * does NOT merge across separate runs — each build starts from an empty
 * outDir (see build-title-tiles-{ew,scotland}.mjs), consistent with the
 * "rebuilt fresh from source each quarter, nothing kept between runs"
 * design in docs/TITLE_BOUNDARY_API_PLAN.md.
 *
 * parcels: [{ titleNumber, tenure, polygons }] — polygons as
 * cellIdsForRings() above (array of rings, each [lng, lat] pairs).
 * Returns the number of distinct cell files touched, for progress logging.
 */
export async function appendParcelsToTiles(outDir, nation, parcels) {
  const byCell = new Map()
  for (const p of parcels) {
    const feature = {
      type: 'Feature',
      properties: { title_number: p.titleNumber, tenure: p.tenure ?? null },
      // Always MultiPolygon, one member per ring — matches
      // titleBoundariesDb.mjs's polygonsToMultiPolygonWkt: these datasets
      // don't carry holes, so each ring is its own single-ring member.
      geometry: { type: 'MultiPolygon', coordinates: p.polygons.map((ring) => [ring]) },
    }
    for (const cellId of cellIdsForRings(p.polygons)) {
      if (!byCell.has(cellId)) byCell.set(cellId, [])
      byCell.get(cellId).push(feature)
    }
  }

  const dir = join(outDir, nation)
  await mkdir(dir, { recursive: true })

  for (const [cellId, newFeatures] of byCell) {
    const filePath = join(dir, `${cellId}.json`)
    let existingFeatures = []
    try {
      const raw = await readFile(filePath, 'utf8')
      existingFeatures = JSON.parse(raw).features
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    const byTitleNumber = new Map(existingFeatures.map((f) => [f.properties.title_number, f]))
    for (const f of newFeatures) byTitleNumber.set(f.properties.title_number, f)
    await writeFile(filePath, JSON.stringify({ type: 'FeatureCollection', features: [...byTitleNumber.values()] }))
  }

  return byCell.size
}
