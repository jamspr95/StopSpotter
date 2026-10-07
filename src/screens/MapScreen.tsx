import { useMemo, useState } from 'react'
import { MapContainer, Marker, Popup } from 'react-leaflet'
import { Link, useNavigate } from 'react-router-dom'
import { MapTiles, SatelliteToggle } from '../components/MapTiles'
import { MAP_CENTRE, SEED_NOMINATION_COUNT, SEED_TOTAL_SPOTTED } from '../data/seed'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useAppStore } from '../store/useAppStore'

export function MapScreen() {
  const navigate = useNavigate()
  const nominations = useAppStore((s) => s.nominations)
  const hasSeenIntro = useAppStore((s) => s.hasSeenIntro)
  const markIntroSeen = useAppStore((s) => s.markIntroSeen)
  const backendReady = useAppStore((s) => s.backendReady)
  const [satellite, setSatellite] = useState(true)

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
    <div className="relative flex h-dvh flex-col">
      <header className="z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="font-display text-lg font-bold text-brand-700">StopSpotter</span>
        <nav className="flex gap-4 text-sm font-medium text-slate-600">
          <Link to="/my-stops">My Stops</Link>
          <Link to="/support">Support</Link>
        </nav>
      </header>

      <div className="relative flex-1">
        <MapContainer
          center={MAP_CENTRE}
          zoom={12}
          // z-0 contains Leaflet's internal panes/controls (they go up to z-index:1000)
          // in their own stacking context, so the overlay buttons below — on z-10 —
          // reliably paint above the whole map instead of being outranked by it.
          className="z-0 h-full w-full"
          zoomControl={false}
        >
          <MapTiles satellite={satellite} />
          {nominations.map((n) => (
            <Marker key={n.id} position={n.public}>
              <Popup>
                <div className="text-sm">
                  <p className="mb-2 font-medium">
                    {n.answers.placeType.replace('_', ' ')} · {n.status.replace('_', ' ')}
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

        {/* Brand mark, centred at the top of the map and stacked above the
            toggle/badge row below it. On a white chip in its natural
            navy-on-transparent form, matching the toggle/badge pills'
            own white-chip treatment — a forced-white filter was tried
            first (brightness-0 + invert), but that flattens every colour
            in the source artwork to one solid silhouette, which made the
            "Aire" lettering disappear into the rest of the mark rather
            than reading as separate letters. A white backdrop means the
            logo's real navy reads correctly without any filter trick.
            Width is fixed from the source's documented 155:25 aspect
            ratio rather than left to load-time intrinsic sizing, so
            layout doesn't shift/collapse if the external SVG is slow or
            fails to load. */}
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-white px-4 py-2 shadow-sm">
          <img src="https://airestop.co.uk/logo.svg" alt="AireStop" className="h-5 w-[124px]" />
        </div>

        <div className="absolute left-3 top-[60px] z-10">
          <SatelliteToggle satellite={satellite} onChange={setSatellite} />
        </div>

        <div className="absolute right-3 top-[60px] z-10 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
          {backendReady ? `${totalSpotted} stops spotted` : 'Loading…'}
        </div>

        <button
          type="button"
          onClick={() => navigate('/spot')}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg active:bg-brand-700"
        >
          Spot a stop
        </button>

        {!hasSeenIntro && (
          <div className="absolute inset-0 z-30 flex items-end bg-slate-900/40 p-4">
            <div className="w-full rounded-2xl bg-white p-5 shadow-xl">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Help build the UK's motorhome stop network
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                AireStop is on a mission to build a network of motorhome stopovers across the
                UK — and we need your help.
              </p>
              <ol className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
                <li>
                  <span className="font-semibold text-slate-800">1. Spot a stop.</span> Know a
                  good place you'd like to stay? Tell us about it — if we agree, we'll approach
                  the landowner and work to make it happen.
                </li>
                <li>
                  <span className="font-semibold text-slate-800">2. Back a stop.</span> Browse
                  the map and vote for the stops you'd actually use. Every vote helps show a
                  landowner the demand is real.
                </li>
              </ol>
              <p className="mt-3 text-sm text-slate-600">
                Anyone can browse — we'll only ask for your email when you nominate or vote.
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
    </div>
  )
}
