import type { LatLng } from '../types'

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
