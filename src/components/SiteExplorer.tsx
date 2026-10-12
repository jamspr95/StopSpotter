import { useEffect, useState } from 'react'
import { MapContainer } from 'react-leaflet'
import { MapTiles } from './MapTiles'
import { fetchNearbyPlaces, formatDistance, type NearbyPlace } from '../lib/nearbyPlaces'
import { isGoogleMapsConfigured, satelliteEmbedUrl, streetViewEmbedUrl } from '../lib/satelliteImage'
import type { LatLng } from '../types'

/**
 * "Explore the site in detail without leaving this screen" — used both
 * inline on AdminReviewScreen's swipe card and as its own section on
 * AdminStopDetailScreen. Every interactive element here stops pointer
 * propagation: AdminReviewScreen's card listens for pointerdown/move on
 * itself to drive the swipe gesture, and without this a tap (or a map
 * drag) here gets read as a swipe instead — same class of bug already
 * fixed on that card's other buttons (see AdminReviewScreen's "Full
 * details" / "other sites" links).
 *
 * Callers should key this component on the site's coordinates (e.g.
 * `key={`${point.lat}-${point.lng}`}`) wherever the same SiteExplorer
 * instance could end up pointed at a different site without unmounting —
 * AdminStopDetailScreen's route can swap :id without remounting the
 * screen. Leaflet's MapContainer only reads center/zoom once, on mount,
 * so without a fresh key here the embedded map would keep showing
 * whichever site it first opened on.
 */
export function SiteExplorer({ point, compact = false }: { point: LatLng; compact?: boolean }) {
  const [tab, setTab] = useState<'satellite' | 'street_view' | 'nearby'>('satellite')

  const panelHeight = compact ? 'h-48' : 'h-80'

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex overflow-hidden rounded-lg bg-slate-100 text-xs font-medium">
        <button
          type="button"
          onClick={() => setTab('satellite')}
          className={`flex-1 px-3 py-1.5 ${tab === 'satellite' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
        >
          Satellite
        </button>
        <button
          type="button"
          onClick={() => setTab('street_view')}
          className={`flex-1 px-3 py-1.5 ${tab === 'street_view' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
        >
          Street View
        </button>
        <button
          type="button"
          onClick={() => setTab('nearby')}
          className={`flex-1 px-3 py-1.5 ${tab === 'nearby' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
        >
          Nearby
        </button>
      </div>

      {tab === 'satellite' && (
        <div className="mt-2">
          {isGoogleMapsConfigured ? (
            <iframe
              title="Satellite view (pan and zoom)"
              src={satelliteEmbedUrl(point)}
              className={`w-full ${panelHeight} touch-auto rounded-lg border-0`}
              loading="lazy"
            />
          ) : (
            // Same pannable experience, no key needed — the exact same
            // MapTiles component (and the same free Esri imagery) the
            // public map and admin detail map already use.
            <div className={`w-full ${panelHeight} touch-auto overflow-hidden rounded-lg`}>
              <MapContainer center={point} zoom={17} className="h-full w-full" zoomControl={false}>
                <MapTiles satellite />
              </MapContainer>
            </div>
          )}
          {!isGoogleMapsConfigured && (
            <p className="mt-1.5 text-xs text-slate-400">
              Free Esri imagery — add a Google Maps key (docs/SETUP.md §13) for Google's own satellite basemap.
            </p>
          )}
        </div>
      )}

      {tab === 'street_view' && (
        <div className="mt-2">
          {isGoogleMapsConfigured ? (
            <iframe
              title="Street View"
              src={streetViewEmbedUrl(point)}
              className={`w-full ${panelHeight} rounded-lg border-0`}
              loading="lazy"
              allowFullScreen
            />
          ) : (
            <div
              className={`flex w-full ${panelHeight} items-center justify-center rounded-lg bg-slate-100 p-4 text-center text-xs text-slate-500`}
            >
              Street View needs a Google Maps key — see docs/SETUP.md §13.
            </div>
          )}
        </div>
      )}

      {tab === 'nearby' && (
        <div className={`mt-2 ${panelHeight} overflow-y-auto rounded-lg bg-slate-50 p-3`}>
          <NearbyList key={`${point.lat}-${point.lng}`} point={point} />
        </div>
      )}
    </div>
  )
}

// Keyed on point by the caller (see SiteExplorer above) — a fresh mount
// per site means state can just start at 'loading' instead of an effect
// resetting it on every point change.
function NearbyList({ point }: { point: LatLng }) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; places: NearbyPlace[] }
  >({ status: 'loading' })

  useEffect(() => {
    fetchNearbyPlaces(point)
      .then((places) => setState({ status: 'ready', places }))
      .catch(() => setState({ status: 'error' }))
  }, [point])

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-400">Looking up nearby places…</p>
  }
  if (state.status === 'error') {
    return <p className="text-sm text-slate-400">Couldn't load nearby places right now.</p>
  }
  if (state.places.length === 0) {
    return <p className="text-sm text-slate-400">Nothing named within 1.2km in OpenStreetMap's data.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {state.places.map((p) => (
        <li key={`${p.name}-${p.category}`} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-slate-700">
            {p.name} <span className="text-slate-400">· {p.category}</span>
          </span>
          <span className="flex-shrink-0 font-medium text-slate-600">{formatDistance(p.distanceM)}</span>
        </li>
      ))}
    </ul>
  )
}
