import { useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { MapContainer, useMapEvents } from 'react-leaflet'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapTiles, SatelliteToggle } from '../components/MapTiles'
import { ScreenHeader } from '../components/ScreenHeader'
import { MAP_CENTRE } from '../data/seed'
import * as db from '../lib/db'
import { findDuplicateWithin200m } from '../lib/geo'
import { searchLocation } from '../lib/geocode'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useAppStore } from '../store/useAppStore'
import type { LatLng } from '../types'

function CenterTracker({ onMove }: { onMove: (centre: LatLng) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter()
      onMove({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

export function DropPinScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  // MapScreen passes its current viewport (centre/zoom) when sending someone
  // here via "Spot a stop", so the pin starts over whatever they were
  // actually looking at rather than jumping back to MAP_CENTRE — falls back
  // to that default when arriving some other way (e.g. a direct /spot link).
  const incomingView = location.state as { centre?: LatLng; zoom?: number } | null
  const initialCentre = incomingView?.centre ?? MAP_CENTRE
  const initialZoom = incomingView?.zoom ?? 14
  const mapRef = useRef<LeafletMap | null>(null)
  const [satellite, setSatellite] = useState(true)
  const [centre, setCentre] = useState<LatLng>(initialCentre)
  const [locating, setLocating] = useState(false)
  const [checking, setChecking] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const nominations = useAppStore((s) => s.nominations)
  const beginNomination = useAppStore((s) => s.beginNomination)
  const beginVote = useAppStore((s) => s.beginVote)

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    try {
      const result = await searchLocation(q)
      if (!result) {
        setSearchError(`Couldn't find "${q}". Try a different place name or postcode.`)
        return
      }
      mapRef.current?.setView(result.point, 15)
      // Centres the map only, same as "Use my location" — nothing from the
      // search is stored until a pin is actually confirmed.
    } finally {
      setSearching(false)
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        mapRef.current?.setView(next, 15)
        setLocating(false)
        // Centres the map only — the user's own location is never stored (docs/BUILD_PLAN.md).
      },
      () => setLocating(false),
      { timeout: 8000 },
    )
  }

  async function handleConfirm() {
    // exact_location isn't readable client-side in real-backend mode (see
    // supabase/migrations/0001_init.sql) — the public nominations list this
    // screen's local-only check runs against doesn't have it, so this has
    // to be a server-side RPC instead once Supabase is configured.
    if (isSupabaseConfigured) {
      setChecking(true)
      try {
        const nearby = await db.findNearbyNomination(centre)
        if (nearby) {
          beginVote(nearby.id)
          navigate('/vote', { state: { duplicateNotice: true } })
          return
        }
      } catch (err) {
        // Fail open: if the duplicate check can't reach the backend, let the
        // user proceed to nominate rather than get stuck on this screen.
        console.error('StopSpotter: duplicate-pin check failed.', err)
      } finally {
        setChecking(false)
      }
    } else {
      const duplicate = findDuplicateWithin200m(centre, nominations)
      if (duplicate) {
        beginVote(duplicate.id)
        navigate('/vote', { state: { duplicateNotice: true } })
        return
      }
    }
    beginNomination(centre)
    navigate('/spot/form')
  }

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="Drop a pin" />

      <div className="border-b border-slate-200 p-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="search"
            enterKeyHint="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSearchError(null)
            }}
            placeholder="Search a place or postcode"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800"
          />
          <button
            type="submit"
            disabled={searching || searchQuery.trim() === ''}
            className="flex-shrink-0 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {searching ? '…' : 'Search'}
          </button>
        </form>
        {searchError && <p className="mt-2 text-xs text-red-600">{searchError}</p>}
        <p className="mt-2 text-xs text-slate-500">
          Ideal stops are unused, flat land close to amenities and services. Think water,
          drainage, and a pub or shop within easy reach.
        </p>
      </div>

      <div className="relative flex-1">
        <MapContainer
          ref={mapRef}
          center={initialCentre}
          zoom={initialZoom}
          // See MapScreen: z-0 contains Leaflet's internal panes/controls so the
          // crosshair and overlay buttons below reliably paint above the map.
          className="z-0 h-full w-full"
          zoomControl={false}
        >
          <MapTiles satellite={satellite} />
          <CenterTracker onMove={setCentre} />
        </MapContainer>

        {/* Fixed crosshair — the map moves underneath it, matching the spec's drop-pin interaction. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full text-3xl">
          📍
        </div>

        <div className="absolute left-3 top-3 z-10">
          <SatelliteToggle satellite={satellite} onChange={setSatellite} />
        </div>

        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className="absolute bottom-24 right-3 z-10 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-60"
        >
          {locating ? 'Locating…' : '📍 Use my location'}
        </button>
      </div>

      <div className="border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={checking}
          className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white disabled:opacity-60 active:bg-brand-700"
        >
          {checking ? 'Checking…' : 'Confirm location'}
        </button>
      </div>
    </div>
  )
}
