import { useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { MapContainer, useMapEvents } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { MapTiles, SatelliteToggle } from '../components/MapTiles'
import { ScreenHeader } from '../components/ScreenHeader'
import { MAP_CENTRE } from '../data/seed'
import * as db from '../lib/db'
import { findDuplicateWithin200m } from '../lib/geo'
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
  const mapRef = useRef<LeafletMap | null>(null)
  const [satellite, setSatellite] = useState(true)
  const [centre, setCentre] = useState<LatLng>(MAP_CENTRE)
  const [locating, setLocating] = useState(false)
  const [checking, setChecking] = useState(false)
  const nominations = useAppStore((s) => s.nominations)
  const beginNomination = useAppStore((s) => s.beginNomination)
  const beginVote = useAppStore((s) => s.beginVote)

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

      <div className="border-b border-slate-200 p-3">
        <input
          type="text"
          placeholder="Search a place or postcode (coming soon — drag the map for now)"
          disabled
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400"
        />
        <p className="mt-2 text-xs text-slate-500">
          Vacant land, not car parks where possible, and at least 20m from homes.
        </p>
      </div>

      <div className="relative flex-1">
        <MapContainer
          ref={mapRef}
          center={MAP_CENTRE}
          zoom={14}
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
