// StopSpotter — on-demand title boundary lookup (replaces the bulk
// title_boundaries table — see docs/TITLE_BOUNDARY_API_PLAN.md).
//
// Given one nomination's coordinates, works out which grid tile it falls
// in, fetches just that one small pre-built GeoJSON file from the
// matching nation's title-tiles-latest-{ew,scotland}-{0,1,2} GitHub
// Release (published by jamspr95/stopspotter-title-tiles's
// build-title-tiles.yml workflow — a separate public repo, not this one;
// see tileBaseUrl() below for why), and does a plain point-in-polygon
// check against whatever parcels that tile contains.
// Never touches Postgres for the national data — only the admin RPC that
// calls this (admin_set_nomination_title, 0017_title_lookup_columns.sql)
// writes the single resolved result back.
//
// Called from AdminStopDetailScreen's "Look up title" button — an admin
// action, not a public one, so this checks current_user_is_admin() itself
// rather than trusting the caller, the same way every admin_* RPC does.

import { createClient } from 'npm:@supabase/supabase-js@2'

// Real incident (Oct 2026): "nothing happens" when the button is clicked.
// This is the first (and so far only) edge function in this project
// actually called from the browser — supabase-js's functions.invoke()
// sends a custom Authorization header, which makes the browser send a
// CORS preflight OPTIONS request first. This function had no CORS
// handling at all, so that preflight hit the `req.method !== 'POST'`
// check below and got back a bare 405 with no Access-Control-Allow-*
// headers — the browser then blocks the real POST as a CORS failure
// before it ever reaches this function, surfacing to supabase-js as a
// generic network error. Confirmed from the real edge function logs:
// nothing but a long run of "OPTIONS | 405" entries, no POST ever
// logged. Every response (including the preflight's) now carries these
// headers so the browser actually lets the POST through.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ============================================================================
// Grid math — MUST stay byte-for-byte identical to
// jamspr95/stopspotter-title-tiles's scripts/lib/titleTiles.mjs
// (CELL_SIZE_DEG/FINE_CELLS_PER_SHARD/NUM_RELEASE_PARTITIONS/cellIdForPoint/
// shardIdForCellId/releasePartitionForShardId). They're duplicated (not
// shared via import) because one runs under Node, in a different repo
// entirely, and this one under Deno; see that file's own top-of-file
// comment for why that's a deliberate tradeoff, not an oversight, and for
// why there are two grid sizes (a fine lookup grid vs. a shard/file-
// boundary grid) rather than one.
// ============================================================================
const CELL_SIZE_DEG = 0.1
// Real incident (20 Oct 2026, second round): FINE_CELLS_PER_SHARD=2
// fixed the TYPICAL lookup but not the real worst case — see
// fetchTile's own comment below. Dropped to 1 (no shard grouping at all
// — a shard IS a fine cell) as part of that fix.
const FINE_CELLS_PER_SHARD = 1

function cellIdForPoint(lat: number, lng: number): string {
  const latBucket = Math.floor(lat / CELL_SIZE_DEG)
  const lngBucket = Math.floor(lng / CELL_SIZE_DEG)
  return `${latBucket}_${lngBucket}`
}

function shardIdForCellId(cellId: string): string {
  const [latBucket, lngBucket] = cellId.split('_').map(Number)
  const shardLatBucket = Math.floor(latBucket / FINE_CELLS_PER_SHARD)
  const shardLngBucket = Math.floor(lngBucket / FINE_CELLS_PER_SHARD)
  return `${shardLatBucket}_${shardLngBucket}`
}

// FINE_CELLS_PER_SHARD dropping to 1 roughly quadruples the per-nation
// file count on its own, which on its own would exceed GitHub's
// 1,000-asset-per-release cap again — so each nation's release now
// splits further, into NUM_RELEASE_PARTITIONS releases rather than one.
// Split by the shard's own latitude bucket, modulo the partition count —
// not a fixed real-world latitude threshold — so this needs no assumption
// about where a nation's latitude range starts or ends, and spreads
// adjacent-latitude shards (where real density is often similar — see
// FINE_CELLS_PER_SHARD's own incident note on where England & Wales'
// density problem concentrates) across *different* partitions rather
// than lumping a dense band entirely into one release.
const NUM_RELEASE_PARTITIONS = 3

function releasePartitionForShardId(shardId: string): number {
  const [latBucket] = shardId.split('_').map(Number)
  return ((latBucket % NUM_RELEASE_PARTITIONS) + NUM_RELEASE_PARTITIONS) % NUM_RELEASE_PARTITIONS
}

// The build pipeline that publishes these releases now lives in its own
// public repo (jamspr95/stopspotter-title-tiles), split out so it can
// stay public once this app repo goes private — see that repo's README.
// A plain unauthenticated fetch like the one below only ever works
// against a PUBLIC repo's release assets; a private repo's assets need
// api.github.com + a token instead, which is the whole reason this
// moved rather than just making this repo private directly.
function tileBaseUrl(nation: 'england_wales' | 'scotland', shardId: string): string {
  const tagSuffix = nation === 'england_wales' ? 'ew' : 'scotland'
  const partition = releasePartitionForShardId(shardId)
  return `https://github.com/jamspr95/stopspotter-title-tiles/releases/download/title-tiles-latest-${tagSuffix}-${partition}`
}

interface TitleTileLine {
  c: string
  type: 'Feature'
  properties: { title_number: string; tenure: string | null }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

type TitleFeature = Omit<TitleTileLine, 'c'>

// Each release asset is a gzipped shard covering FINE_CELLS_PER_SHARD^2
// fine cells, written as newline-delimited JSON — one line per feature
// per fine cell it belongs to, each line carrying its own fine cell id
// ("c") — see jamspr95/stopspotter-title-tiles's scripts/lib/titleTiles.mjs's writeParcelsToShardParts/
// finalizeShards. There's no top-level index structure, so this filters
// to the one fine cell actually asked for as it streams the lines.
//
// Real incident (20 Oct 2026): "Memory limit exceeded" on every real
// lookup. A real shard checked directly is 186MB decompressed, 75,349
// lines (england_wales_100_-10.json.gz) — the comment this replaced
// ("a shard is small enough... reading the whole decompressed text at
// once is fine") was simply never checked against real data. Buffering
// that whole string via `.text()`, then JSON.parse-ing all 75,349 lines
// into objects just to keep the handful matching one fine cell, blew
// past the edge runtime's memory limit on its own - twice over, since
// both nations' shards were fetched and buffered concurrently. The same
// architectural mistake as the BUILD side's own earlier OOM incident
// (accumulate-everything-before-filtering instead of processing
// bounded pieces and discarding them) and SiteFinder's pipeline.py OOM,
// just on the read side this time.
//
// Fixed by reading the decompressed stream in chunks and only ever
// holding one in-progress line at a time, with a cheap substring check
// before paying for a full JSON.parse on a line that can't match -
// peak memory is now one line's worth, not one shard's worth.
//
// Second real incident, same day: that fix stopped the memory crash,
// but the VERY NEXT real attempt failed with "CPU Time exceeded"
// instead. Measured directly: gzip-DECOMPRESSING that same 186MB shard
// alone cost ~2.1s of CPU time - Supabase's Edge Functions hard-cap CPU
// time at 2s per request, and it isn't configurable on the hosted
// platform (self-hosting only). FINE_CELLS_PER_SHARD shrinking 5->2
// fixed the TYPICAL shard, but real measurement against the actual
// rebuilt data found the fix was still incomplete: the densest England &
// Wales shard (central London) decompressed to 457MB (~5.6s CPU), and
// the worst Scotland shard - only 1,458 lines, but 240MB decompressed
// (~16s CPU) - for an entirely different reason: a title registered as
// hundreds of disjoint scattered parts (e.g. common grazing rights
// spread across a whole county) was tagged, in full, into every fine
// cell across the COMBINED bounding box of every part, not just the
// cells actually near each one.
//
// Real (second) fix, same day: FINE_CELLS_PER_SHARD dropped to 1 (no
// shard grouping at all), and - on the OTHER repo's side -
// writeParcelsToShardParts now tags and simplifies per RING instead of
// per whole parcel (see that function's own comment in
// jamspr95/stopspotter-title-tiles's scripts/lib/titleTiles.mjs for why
// that's what actually fixed Scotland's outliers, not the shard-size
// change). Measured directly against the real rebuilt data after both
// changes: the same worst London fine cell dropped to ~62MB decompressed
// (~0.9s CPU), and the same worst Scotland shard-area's content dropped
// by roughly 17x once split per fine cell - both comfortably under the
// 2s budget with real margin this time, not just the typical case.
async function fetchTile(nation: 'england_wales' | 'scotland', cellId: string): Promise<TitleFeature[]> {
  const shardId = shardIdForCellId(cellId)
  const res = await fetch(`${tileBaseUrl(nation, shardId)}/${nation}_${shardId}.json.gz`)
  if (res.status === 404) return [] // no parcels in this shard for this nation — normal, not an error
  if (!res.ok) throw new Error(`Failed to fetch shard ${nation}/${shardId}: ${res.status}`)
  if (!res.body) return []

  const features: TitleFeature[] = []
  const needle = `"c":"${cellId}"`
  const reader = res.body.pipeThrough(new DecompressionStream('gzip')).getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function consumeLine(line: string) {
    if (!line || !line.includes(needle)) return // cheap pre-check — skip the other fine cells' lines unparsed
    const parsed: TitleTileLine = JSON.parse(line)
    if (parsed.c !== cellId) return // the substring check alone could coincidentally match inside other fields
    features.push({ type: parsed.type, properties: parsed.properties, geometry: parsed.geometry })
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        consumeLine(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
      }
    }
    buffer += decoder.decode() // flush a trailing partial multi-byte sequence, if any
    consumeLine(buffer)
  } finally {
    reader.releaseLock()
  }

  return features
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
    // see jamspr95/stopspotter-title-tiles's scripts/lib/titleTiles.mjs's writeParcelsToShardParts.
    for (const member of feature.geometry.coordinates) {
      if (pointInRing(lng, lat, member[0])) return feature
    }
  }
  return null
}

Deno.serve(async (req) => {
  // The CORS preflight itself — must return 2xx with these headers or the
  // browser never sends the real POST at all (see corsHeaders' comment above).
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  let payload: { lat?: number; lng?: number }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders })
  }
  if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') {
    return new Response('Body must be { lat: number, lng: number }', { status: 400, headers: corsHeaders })
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
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
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
      // The matched parcel's own outline — an indicative extent, not the
      // legal boundary (see 0015_title_boundaries.sql's original caveat,
      // still true here) — so the admin map can draw it, not just show
      // the title number as text.
      geometry: match?.geometry ?? null,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
