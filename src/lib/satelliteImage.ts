import type { LatLng } from '../types'

/**
 * Admin-only sharper satellite imagery + Street View — docs/SETUP.md §13.
 * The Maps Static/Embed APIs are genuinely billed per load (Static:
 * ~$2/1,000; Embed's Street View mode is free, confirmed on Google's own
 * usage-and-billing page) — cheap at admin-only review volume, but a real
 * key is required either way, so everything here degrades to the free
 * Esri layer already used on the public map when no key is configured.
 */
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
export const isGoogleMapsConfigured = Boolean(GOOGLE_MAPS_API_KEY)

export type SatelliteZoomLevel = 'wide' | 'close' | 'closer'

// Google's `zoom` is a discrete level; the Esri fallback instead needs a
// span in metres to build a bounding box, so each preset keeps a rough
// manual equivalent for both rather than deriving one from the other.
const GOOGLE_ZOOM: Record<SatelliteZoomLevel, number> = { wide: 17, close: 18, closer: 19 }
const ESRI_SPAN_M: Record<SatelliteZoomLevel, number> = { wide: 300, close: 150, closer: 75 }

function esriExportUrl(point: LatLng, spanMeters: number, size: number): string {
  // Free, no key — the same World_Imagery source already used by
  // MapTiles.tsx's interactive layer, just requested as one flat image
  // (ArcGIS REST's /export operation) instead of a tiled, pannable map.
  const latDelta = spanMeters / 111_320
  const lngDelta = spanMeters / (111_320 * Math.cos((point.lat * Math.PI) / 180))
  const bbox = [point.lng - lngDelta, point.lat - latDelta, point.lng + lngDelta, point.lat + latDelta].join(',')
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${size},${size}&format=png32&f=image`
}

/** A static satellite image centred on `point` — Google's (sharper) if configured, else the free Esri fallback. */
export function satelliteImageUrl(point: LatLng, level: SatelliteZoomLevel = 'close', size = 480): string {
  if (isGoogleMapsConfigured) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${point.lat},${point.lng}&zoom=${GOOGLE_ZOOM[level]}&size=${size}x${size}&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`
  }
  return esriExportUrl(point, ESRI_SPAN_M[level], size)
}

/**
 * An embeddable Street View iframe URL (Maps Embed API) — there's no free
 * equivalent of this to fall back to, so callers must check
 * `isGoogleMapsConfigured` first and show their own "not set up" state.
 */
export function streetViewEmbedUrl(point: LatLng): string {
  return `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&location=${point.lat},${point.lng}&fov=90`
}
