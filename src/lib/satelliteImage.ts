import type { LatLng } from '../types'

/**
 * Admin-only sharper satellite imagery + Street View — docs/SETUP.md §13.
 * Both now go through the Maps Embed API's free, unlimited modes (view
 * and streetview — confirmed on Google's own usage-and-billing page: a
 * basic Embed mode, no per-load charge, panning/zooming included). The
 * one-off static image this used to request from the paid Maps Static
 * API (~$2/1,000) is gone — there's nothing left here that costs money.
 * Everything still degrades to the free Esri layer already used on the
 * public map when no key is configured.
 */
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
export const isGoogleMapsConfigured = Boolean(GOOGLE_MAPS_API_KEY)

export type SatelliteZoomLevel = 'wide' | 'close' | 'closer'

const ESRI_SPAN_M: Record<SatelliteZoomLevel, number> = { wide: 300, close: 150, closer: 75 }

// Esri's /export has no separate "scale"/retina parameter the way Google's
// APIs do — the same effect (genuinely more source pixels over the same
// geographic area, not a bigger copy of the same data stretched to fit)
// means just asking for a larger `size` than the <img> is displayed at.
const PIXEL_DENSITY = 2

/**
 * A static satellite thumbnail centred on `point` — the swipe card's
 * "profile picture" and nothing else now (see satelliteEmbedUrl for the
 * actual pannable explore view). Always the free Esri layer: this is a
 * small glance-preview next to an "Explore" button, not something worth
 * spending the Embed API's one billed mode budget on were it ever to need
 * one — it doesn't.
 */
export function satelliteImageUrl(point: LatLng, level: SatelliteZoomLevel = 'close', size = 480): string {
  const spanMeters = ESRI_SPAN_M[level]
  const latDelta = spanMeters / 111_320
  const lngDelta = spanMeters / (111_320 * Math.cos((point.lat * Math.PI) / 180))
  const bbox = [point.lng - lngDelta, point.lat - latDelta, point.lng + lngDelta, point.lat + latDelta].join(',')
  const pixels = size * PIXEL_DENSITY
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${pixels},${pixels}&format=png32&f=image`
}

/**
 * A pannable, zoomable satellite map (Maps Embed API's `view` mode) — the
 * actual "explore around the site" view. Free and unlimited, same as
 * Street View below: Google's own billing page says panning, zooming and
 * switching layers inside an embed don't generate extra loads. There's no
 * free equivalent of Google's own satellite basemap to fall back to here
 * (unlike the static thumbnail above) — callers without a key should use
 * a real Leaflet <MapContainer> with the existing MapTiles component
 * instead, which is exactly as pannable and is what the public map
 * already uses.
 */
export function satelliteEmbedUrl(point: LatLng, zoom = 18): string {
  return `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${point.lat},${point.lng}&zoom=${zoom}&maptype=satellite`
}

/**
 * An embeddable Street View iframe URL (Maps Embed API) — there's no free
 * equivalent of this to fall back to, so callers must check
 * `isGoogleMapsConfigured` first and show their own "not set up" state.
 */
export function streetViewEmbedUrl(point: LatLng): string {
  return `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&location=${point.lat},${point.lng}&fov=90`
}
