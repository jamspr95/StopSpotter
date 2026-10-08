import type { LatLng } from '../types'

export interface LocationSearchResult {
  point: LatLng
  label: string
}

// A loose match is enough here — these only decide which free lookup to try
// first, a wrong guess just falls through to the next one rather than failing.
const FULL_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
const OUTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/i

/**
 * Forward geocode for the drop-pin screen's search field — a full or
 * partial UK postcode goes to postcodes.io (free, no key, GOV-sourced and
 * accurate for postcodes specifically, which Nominatim often isn't), and
 * anything else (a place/town name) goes to Nominatim's search endpoint,
 * same free OSM source already behind the map tiles and the reverse-geocode
 * area label above. Never throws — a failed or ambiguous lookup just
 * returns null, same convention as reverseGeocodeAreaLabel.
 */
export async function searchLocation(query: string): Promise<LocationSearchResult | null> {
  const q = query.trim()
  if (!q) return null

  if (FULL_POSTCODE_RE.test(q)) {
    const viaPostcode = await lookupPostcode(q)
    if (viaPostcode) return viaPostcode
  } else if (OUTCODE_RE.test(q)) {
    const viaOutcode = await lookupOutcode(q)
    if (viaOutcode) return viaOutcode
  }

  return searchPlaceName(q)
}

async function lookupPostcode(postcode: string): Promise<LocationSearchResult | null> {
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { result?: { latitude: number; longitude: number; postcode: string } }
    const r = data.result
    if (!r) return null
    return { point: { lat: r.latitude, lng: r.longitude }, label: r.postcode }
  } catch {
    return null
  }
}

async function lookupOutcode(outcode: string): Promise<LocationSearchResult | null> {
  try {
    const res = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { result?: { latitude: number; longitude: number; outcode: string } }
    const r = data.result
    if (!r) return null
    return { point: { lat: r.latitude, lng: r.longitude }, label: r.outcode }
  } catch {
    return null
  }
}

async function searchPlaceName(query: string): Promise<LocationSearchResult | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('q', query)
    url.searchParams.set('countrycodes', 'gb')
    url.searchParams.set('limit', '1')

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null

    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
    const first = data[0]
    if (!first) return null
    return { point: { lat: Number(first.lat), lng: Number(first.lon) }, label: first.display_name }
  } catch {
    return null
  }
}

/**
 * Best-effort reverse geocode to a friendly, human-recognisable area name
 * (town/village/suburb) for the public stop card — not the formal
 * local-authority boundary (that's councilArea/council_area_for_point,
 * Milestone 2's still-unloaded ONS boundary data, needed for admin/LPA
 * outreach but not for a nominator or voter reading the card). Uses
 * OpenStreetMap's free Nominatim API — same source already behind the
 * app's own OSM map tiles, no new key or paid dependency. Never throws: a
 * failed or slow lookup just means no area label on the card, not a
 * broken nomination — called once per nomination, at save time, not on
 * every card view.
 */
export async function reverseGeocodeAreaLabel(point: LatLng): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(point.lat))
    url.searchParams.set('lon', String(point.lng))
    // Town/village level, not a full street address — see the address-field
    // priority below, which picks the most locally-recognisable name
    // available at roughly that zoom.
    url.searchParams.set('zoom', '14')

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null

    const data = (await res.json()) as { address?: Record<string, string> }
    const address = data.address ?? {}
    return (
      address.town ?? address.village ?? address.hamlet ?? address.suburb ?? address.city ?? address.county ?? null
    )
  } catch {
    return null
  }
}
