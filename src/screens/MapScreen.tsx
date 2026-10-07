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
  const [satellite, setSatellite] = useState(true)

  const totalSpotted = useMemo(
    // SEED_TOTAL_SPOTTED already accounts for the demo markers in seedNominations,
    // so only nominations added this session on top of that should add to it.
    () => SEED_TOTAL_SPOTTED + Math.max(0, nominations.length - SEED_NOMINATION_COUNT),
    [nominations.length],
  )

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

        <div className="absolute left-3 top-3 z-10">
          <SatelliteToggle satellite={satellite} onChange={setSatellite} />
        </div>

        <div className="absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
          {totalSpotted} stops spotted
        </div>

        <button
          type="button"
          onClick={() => navigate('/spot')}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg active:bg-brand-700"
        >
          Spot a stop
        </button>

        {/* AireStop watermark, sat just above the Leaflet/Esri attribution strip.
            Same source SVG as the app's own LogoWordmark component; forced white
            with a filter since the source is navy-on-transparent for light surfaces —
            the same "invert via a white tint" treatment that component reserves for
            dark surfaces. Width is fixed from the component's documented 155:25
            aspect ratio rather than left to load-time intrinsic sizing, so layout
            doesn't shift/collapse if the external SVG is slow or fails to load.
            Sized to clear the centred "Spot a stop" button on a narrow phone
            screen — a wider logo (e.g. the +30% of LogoWordmark's 22px default
            that was tried first) overlapped it; this is the largest size that
            still fits the gap to the button's right. */}
        <img
          src="https://airestop.co.uk/logo.svg"
          alt="AireStop"
          className="absolute bottom-7 right-2 z-10 h-[18px] w-[112px] brightness-0 invert"
        />

        {!hasSeenIntro && (
          <div className="absolute inset-0 z-30 flex items-end bg-slate-900/40 p-4">
            <div className="w-full rounded-2xl bg-white p-5 shadow-xl">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Help find the next aire
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Seen somewhere that would make a good motorhome stop? Drop a pin and tell us
                about it, or vote on stops other people have already found. Anyone can browse —
                we only ask for your email when you nominate or vote.
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
