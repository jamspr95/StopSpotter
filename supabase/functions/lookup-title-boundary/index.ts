// StopSpotter — on-demand title boundary lookup (replaces the bulk
// title_boundaries table — see docs/TITLE_BOUNDARY_API_PLAN.md).
//
// Given one nomination's coordinates, works out which grid tile it falls
// in, fetches just that one small pre-built GeoJSON file from the
// title-tiles-latest GitHub Release (published by
// .github/workflows/build-title-tiles.yml), and does a plain
// point-in-polygon check against whatever parcels that tile contains.
// Never touches Postgres for the national data — only the admin RPC that
// calls this (admin_set_nomination_title, 0017_title_lookup_columns.sql)
// writes the single resolved result back.
//
// Called from AdminStopDetailScreen's "Look up title" button — an admin
// action, not a public one, so this checks current_user_is_admin() itself
// rather than trusting the caller, the same way every admin_* RPC does.

import { createClient } from 'npm:@supabase/supabase-js@2'

// ============================================================================
// Grid math — MUST stay byte-for-byte identical to scripts/lib/titleTiles.mjs's
// CELL_SIZE_DEG/cellIdForPoint. They're duplicated (not shared via import)
// because one runs under Node and this one under Deno; see that file's own
// top-of-file comment for why that's a deliberate tradeoff, not an oversight.
// ============================================================================
const CELL_SIZE_DEG = 0.1

function cellIdForPoint(lat: number, lng: number): string {
  const latBucket = Math.floor(lat / CELL_SIZE_DEG)
  const lngBucket = Math.floor(lng / CELL_SIZE_DEG)
  return `${latBucket}_${lngBucket}`
}

const RELEASE_TAG = 'title-tiles-latest'
const TILE_BASE_URL = `https://github.com/jamspr95/StopSpotter/releases/download/${RELEASE_TAG}`

interface TitleFeature {
  type: 'Feature'
  properties: { title_number: string; tenure: string | null }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

async function fetchTile(nation: 'england_wales' | 'scotland', cellId: string): Promise<TitleFeature[]> {
  const res = await fetch(`${TILE_BASE_URL}/${nation}_${cellId}.json`)
  if (res.status === 404) return [] // no parcels in this cell for this nation — normal, not an error
  if (!res.ok) throw new Error(`Failed to fetch tile ${nation}/${cellId}: ${res.status}`)
  const body = await res.json()
  return body.features ?? []
}

/** Plain ray-casting point-in-polygon, ring = [[lng, lat], ...]. */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i]
    const [lngJ, latJ] = ring[j]
    const crosses = latI > lat !== latJ > lat
    if (!crosses) continue
    const atLng = lngI + ((lat - latI) / (latJ - latI)) * (lngJ - lngI)
    if (lng < atLng) inside = !inside
  }
  return inside
}

function findMatch(lng: number, lat: number, features: TitleFeature[]): TitleFeature | null {
  for (const feature of features) {
    // Each MultiPolygon member here is always a single ring (no holes) —
    // see scripts/lib/titleTiles.mjs's appendParcelsToTiles.
    for (const member of feature.geometry.coordinates) {
      if (pointInRing(lng, lat, member[0])) return feature
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let payload: { lat?: number; lng?: number }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') {
    return new Response('Body must be { lat: number, lng: number }', { status: 400 })
  }

  // Authorization check: forward the CALLER's own JWT (not the service
  // role) so current_user_is_admin() evaluates auth.uid() for whoever
  // actually invoked this function, exactly like every admin_* RPC does.
  const supabaseAsCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: isAdmin, error: authError } = await supabaseAsCaller.rpc('current_user_is_admin')
  if (authError || !isAdmin) {
    return new Response('Unauthorized', { status: 401 })
  }

  const cellId = cellIdForPoint(payload.lat, payload.lng)

  // Try both nations' tiles for this cell — cheap (small files, GitHub's
  // own CDN), and simpler than threading a nation guess through from the
  // caller. England/Wales and Scotland never overlap, so at most one
  // nation will ever actually produce a match for a given point.
  const [ewFeatures, scotlandFeatures] = await Promise.all([
    fetchTile('england_wales', cellId),
    fetchTile('scotland', cellId),
  ])

  const match = findMatch(payload.lng, payload.lat, ewFeatures) ?? findMatch(payload.lng, payload.lat, scotlandFeatures)

  return new Response(
    JSON.stringify({
      titleNumber: match?.properties.title_number ?? null,
      tenure: match?.properties.tenure ?? null,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
