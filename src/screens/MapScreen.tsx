import { useMemo, useState } from 'react'
import { MapContainer, Marker, Popup } from 'react-leaflet'
import { Link, useNavigate } from 'react-router-dom'
import { MapTiles, SatelliteToggle } from '../components/MapTiles'
import { MAP_CENTRE, SEED_NOMINATION_COUNT, SEED_TOTAL_SPOTTED } from '../data/seed'
import { useAppStore } from '../store/useAppStore'

export function MapScreen() {
  const navigate = useNavigate()
  const nominations = useAppStore((s) => s.nominations)
  const hasSeenIntro = useAppStore((s) => s.hasSeenIntro)
  const markIntroSeen = useAppStore((s) => s.markIntroSeen)
  const [satellite, setSatellite] = useState(false)

  const totalSpotted = useMemo(
    // SEED_TOTAL_SPOTTED already accounts for the demo markers in seedNominations,
    // so only nominations added this session on top of that should add to it.
    () => SEED_TOTAL_SPOTTED + Math.max(0, nominations.length - SEED_NOMINATION_COUNT),
    [nominations.length],
  )

  return (
    <div className="relative flex h-dvh flex-col">
      <header className="z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-lg font-bold text-teal-700">StopSpotter</span>
        <nav className="flex gap-4 text-sm font-medium text-slate-600">
          <Link to="/my-spots">My spots</Link>
          <Link to="/support">Support</Link>
        </nav>
      </header>

      <div className="relative flex-1">
        <MapContainer
          center={MAP_CENTRE}
          zoom={12}
          className="h-full w-full"
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
                    onClick={() => navigate(`/site/${n.id}`)}
                    className="font-semibold text-teal-700 underline"
                  >
                    View site
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <div className="absolute left-3 top-3 z-10">
          <SatelliteToggle satellite={satellite} onChange={setSatellite} />
        </div>

        <div className="absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
          {totalSpotted} sites spotted
        </div>

        <button
          type="button"
          onClick={() => navigate('/spot')}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-teal-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg active:bg-teal-700"
        >
          Spot a site
        </button>

        {!hasSeenIntro && (
          <div className="absolute inset-0 z-30 flex items-end bg-slate-900/40 p-4">
            <div className="w-full rounded-2xl bg-white p-5 shadow-xl">
              <h2 className="text-lg font-bold text-slate-900">Help find the next aire</h2>
              <p className="mt-2 text-sm text-slate-600">
                See a spot that would make a good motorhome stop? Drop a pin and tell us about
                it, or vote on spots other people have already found. Anyone can browse — we
                only ask for your email when you nominate or vote.
              </p>
              <button
                type="button"
                onClick={markIntroSeen}
                className="mt-4 w-full rounded-xl bg-teal-600 py-3 text-base font-semibold text-white active:bg-teal-700"
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
