import L from 'leaflet'
import { useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Popup, useMapEvents } from 'react-leaflet'
import { Link, useNavigate } from 'react-router-dom'
import { MapTiles, SatelliteToggle } from '../components/MapTiles'
import { SEED_NOMINATION_COUNT, SEED_TOTAL_SPOTTED, UK_OVERVIEW_CENTRE, UK_OVERVIEW_ZOOM } from '../data/seed'
import { PUBLIC_FUZZ_RADIUS_M } from '../lib/geo'
import { formatEnumLabel } from '../lib/labels'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useAppStore } from '../store/useAppStore'
import type { LatLng } from '../types'

/**
 * Tracks the map's current viewport in a ref (not state — nobody needs a
 * re-render on every pan) so "Spot a stop" can hand DropPinScreen the spot
 * someone was actually looking at, instead of always reopening at the UK
 * overview.
 */
// PROJECT_PLAN.md "Relationship to the site finder": candidates SiteFinder
// finds (not yet confirmed by a human — source='site_finder', not 'both')
// render as a visually distinct "Suggested by AireStop" marker, so they
// can't be mistaken for a community-backed stop at a glance. A divIcon
// (plain HTML/CSS) rather than a second image asset — no new image to ship
// for one colour swap.
const suggestedIcon = L.divIcon({
  html: '<div class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-[10px] font-bold text-white shadow-md">AS</div>',
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

function ViewportTracker({ onMove }: { onMove: (centre: LatLng, zoom: number) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter()
      onMove({ lat: c.lat, lng: c.lng }, e.target.getZoom())
    },
  })
  return null
}

export function MapScreen() {
  const navigate = useNavigate()
  const nominations = useAppStore((s) => s.nominations)
  const hasSeenIntro = useAppStore((s) => s.hasSeenIntro)
  const markIntroSeen = useAppStore((s) => s.markIntroSeen)
  const backendReady = useAppStore((s) => s.backendReady)
  const [satellite, setSatellite] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const viewRef = useRef<{ centre: LatLng; zoom: number }>({
    centre: UK_OVERVIEW_CENTRE,
    zoom: UK_OVERVIEW_ZOOM,
  })

  const totalSpotted = useMemo(() => {
    // Real-backend mode: nominations.length is already the genuine DB count
    // (no seed data is loaded — see useAppStore's initial state). The demo
    // baseline below is local-only-mode flavour and would wrongly pad a
    // real count.
    if (isSupabaseConfigured) return nominations.length
    // SEED_TOTAL_SPOTTED already accounts for the demo markers in seedNominations,
    // so only nominations added this session on top of that should add to it.
    return SEED_TOTAL_SPOTTED + Math.max(0, nominations.length - SEED_NOMINATION_COUNT)
  }, [nominations.length])

  return (
    <div className="relative h-dvh">
      <MapContainer
        center={UK_OVERVIEW_CENTRE}
        zoom={UK_OVERVIEW_ZOOM}
        // z-0 contains Leaflet's internal panes/controls (they go up to z-index:1000)
        // in their own stacking context, so the overlay buttons below — on z-10 —
        // reliably paint above the whole map instead of being outranked by it.
        className="z-0 h-full w-full"
        zoomControl={false}
      >
        <MapTiles satellite={satellite} />
        <ViewportTracker onMove={(centre, zoom) => { viewRef.current = { centre, zoom } }} />
        {/* Both together: the pin is what you actually spot and tap at any
            zoom (a 600m-radius circle is near-invisible zoomed out), while
            the circle around it is honest about precision — the public
            location is fuzzed to a ~1km grid (snapToPublicGrid,
            src/lib/geo.ts) to keep the real spot private, so zooming in
            shows the pin sitting inside an area, not at one exact point. */}
        {nominations.map((n) => (
          <Circle
            key={`${n.id}-zone`}
            center={n.public}
            radius={PUBLIC_FUZZ_RADIUS_M}
            pathOptions={{ color: '#10385a', weight: 2, fillColor: '#10385a', fillOpacity: 0.15 }}
          />
        ))}
        {nominations.map((n) => (
          <Marker key={n.id} position={n.public} icon={n.source === 'site_finder' ? suggestedIcon : undefined}>
            <Popup>
              <div className="text-sm">
                {n.source === 'site_finder' && (
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
                    Suggested by AireStop
                  </p>
                )}
                <p className="mb-2 font-medium">
                  {formatEnumLabel(n.answers.placeType, 'Potential stop')} · {n.status.replace('_', ' ')}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/stop/${n.id}`)}
                  className="font-semibold text-brand-700 underline"
                >
                  View stop
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* No header bar — the map is the whole screen. Name and menu sit
          directly on it in white with a drop-shadow for legibility over
          both the OSM and satellite tile layers. */}
      <span className="absolute left-4 top-4 z-10 font-display text-xl font-bold text-white drop-shadow">
        StopSpotter
      </span>

      <div className="absolute right-4 top-4 z-20">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="text-2xl font-bold leading-none text-white drop-shadow"
        >
          ☰
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 w-44 rounded-xl bg-white p-2 text-sm font-medium text-slate-700 shadow-lg">
            <Link
              to="/my-stops"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 active:bg-slate-50"
            >
              My Stops
            </Link>
            <Link
              to="/support"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 active:bg-slate-50"
            >
              Support
            </Link>
          </div>
        )}
      </div>

      {menuOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-10 cursor-default"
        />
      )}

      <div className="absolute left-3 top-[60px] z-10">
        <SatelliteToggle satellite={satellite} onChange={setSatellite} />
      </div>

      <div className="absolute right-3 top-[60px] z-10 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
        {backendReady ? `${totalSpotted} stops spotted` : 'Loading…'}
      </div>

      <button
        type="button"
        onClick={() => navigate('/spot', { state: viewRef.current })}
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg active:bg-brand-700"
      >
        Spot a stop
      </button>

      {!hasSeenIntro && (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-900/40 p-4">
          <div className="w-full rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Help build the UK's motorhome stop network
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              AireStop is on a mission to build a network of motorhome stopovers across the UK,
              and we need your help.
            </p>
            <ol className="mt-4 flex flex-col gap-3 text-sm text-slate-600">
              <li>
                <span className="font-semibold text-slate-800">1. Spot a stop.</span> Know a
                good place you'd like to stay? Tell us about it. If we agree, we'll approach
                the landowner and work to make it happen.
              </li>
              <li>
                <span className="font-semibold text-slate-800">2. Back a stop.</span> Browse the
                map and vote for the stops you'd actually use. Every vote helps show a landowner
                the demand is real.
              </li>
            </ol>
            <p className="mt-4 text-sm text-slate-600">
              Anyone can browse. We'll only ask for your email when you nominate or vote.
            </p>
            <button
              type="button"
              onClick={markIntroSeen}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
