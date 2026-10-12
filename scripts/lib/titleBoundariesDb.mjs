import { createClient } from '@supabase/supabase-js'

export function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never the VITE_ ones — see docs/SETUP.md §15).',
    )
  }
  return createClient(url, key)
}

/** polygons: array of rings, each ring an array of [lng, lat] pairs, first ring is the outer boundary. */
function ringToWkt(ring) {
  return `(${ring.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`
}

function polygonsToMultiPolygonWkt(polygons) {
  // Each "polygon" here is itself one ring (the INSPIRE/cadastral parcel
  // outer boundary — these datasets don't carry holes) rather than a
  // polygon-with-holes structure, so each becomes its own single-ring
  // MULTIPOLYGON member.
  const members = polygons.map((ring) => `(${ringToWkt(ring)})`)
  return `SRID=4326;MULTIPOLYGON(${members.join(',')})`
}

const BATCH_SIZE = 200

/**
 * rows: [{ titleNumber, tenure, polygons, sourceArea }], polygons as above.
 * Upserts in batches on (nation, title_number) — a re-sync replaces each
 * title's polygon with the newer one rather than accumulating duplicates
 * (see 0015_title_boundaries.sql's unique index).
 */
export async function upsertTitleBoundaries(client, nation, rows, onProgress) {
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      nation,
      title_number: r.titleNumber,
      tenure: r.tenure ?? null,
      geom: polygonsToMultiPolygonWkt(r.polygons),
      source_area: r.sourceArea ?? null,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await client.from('title_boundaries').upsert(batch, { onConflict: 'nation,title_number' })
    if (error) throw error
    total += batch.length
    onProgress?.(total, rows.length)
  }
  return total
}
