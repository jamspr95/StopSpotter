import type { LatLng } from '../types'

/**
 * Named venues near a site, with distance — the admin "Explore" panel's
 * Nearby tab. The nomination's own `nearby` answers (src/types.ts) are
 * coarse checkbox categories with no name or distance; this is a real
 * lookup against OpenStreetMap's Overpass API, which already has decent
 * UK amenity coverage and needs no API key.
 *
 * overpass-api.de is a shared community server — its own usage guidance
 * asks regular/commercial users to keep well under its published daily
 * caps, or self-host, once usage is more than occasional. Fine for an
 * admin-only, on-demand, per-stop lookup (not public, not high-frequency),
 * especially cached per point as below, but worth revisiting (self-hosted
 * Overpass, or a paid places API) if this ever gets called at real volume.
 */
export interface NearbyPlace {
  name: string
  category: string
  distanceM: number
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'
const RADIUS_M = 1200
const MAX_RESULTS = 10

// Each clause mirrors one of the user-facing categories below — add a
// clause and a categorize() branch together, they're meant to stay paired.
const QUERY_FILTERS = [
  'node["amenity"="pub"]',
  'node["amenity"="bar"]',
  'node["amenity"="toilets"]',
  'node["shop"="supermarket"]',
  'node["shop"="convenience"]',
  'node["amenity"="restaurant"]',
  'node["amenity"="cafe"]',
  'node["amenity"="fast_food"]',
  'node["historic"]',
  'node["tourism"="attraction"]',
  'way["amenity"="pub"]',
  'way["shop"="supermarket"]',
]

function categorize(tags: Record<string, string>): string | null {
  if (tags.amenity === 'pub' || tags.amenity === 'bar') return 'Pub'
  if (tags.amenity === 'toilets') return 'Public toilets'
  if (tags.shop === 'supermarket') return 'Supermarket'
  if (tags.shop === 'convenience') return 'Shop'
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food') return 'Food & drink'
  if (tags.historic) return 'Historic site'
  if (tags.tourism === 'attraction') return 'Attraction'
  return null
}

function buildQuery(point: LatLng, radiusM: number): string {
  const around = `(around:${radiusM},${point.lat},${point.lng})`
  const clauses = QUERY_FILTERS.map((f) => `  ${f}${around};`).join('\n')
  return `[out:json][timeout:15];\n(\n${clauses}\n);\nout center ${MAX_RESULTS * 4};`
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

interface OverpassElement {
  tags?: Record<string, string>
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
}

// Keyed by rounded point so re-opening the same stop's Explore panel (or
// flipping tabs back and forth) doesn't re-hit the shared Overpass server —
// see the usage-guidance note above.
const cache = new Map<string, Promise<NearbyPlace[]>>()

function cacheKey(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
}

export async function fetchNearbyPlaces(point: LatLng): Promise<NearbyPlace[]> {
  const key = cacheKey(point)
  const cached = cache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildQuery(point, RADIUS_M))}`,
    })
    if (!res.ok) throw new Error(`Overpass request failed (${res.status})`)
    const json = (await res.json()) as { elements?: OverpassElement[] }

    const places: NearbyPlace[] = []
    for (const el of json.elements ?? []) {
      const tags = el.tags ?? {}
      const name = tags.name
      if (!name) continue
      const category = categorize(tags)
      if (!category) continue
      const lat = el.lat ?? el.center?.lat
      const lon = el.lon ?? el.center?.lon
      if (lat == null || lon == null) continue
      places.push({ name, category, distanceM: haversineMeters(point, { lat, lng: lon }) })
    }

    places.sort((a, b) => a.distanceM - b.distanceM)

    // The same real-world pub/shop can come back as both a node and a way
    // (e.g. a named building outline plus its entrance point) — one entry per name+category.
    const seen = new Set<string>()
    return places
      .filter((p) => {
        const k = `${p.name}|${p.category}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, MAX_RESULTS)
  })()

  cache.set(key, promise)
  promise.catch(() => cache.delete(key)) // don't let a failed lookup poison the cache
  return promise
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10}m`
  return `${(metres / 1000).toFixed(1)}km`
}
