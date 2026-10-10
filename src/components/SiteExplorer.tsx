import { useState } from 'react'
import { isGoogleMapsConfigured, satelliteImageUrl, streetViewEmbedUrl, type SatelliteZoomLevel } from '../lib/satelliteImage'
import type { LatLng } from '../types'

const ZOOM_LEVELS: { value: SatelliteZoomLevel; label: string }[] = [
  { value: 'wide', label: 'Wide' },
  { value: 'close', label: 'Close' },
  { value: 'closer', label: 'Closer' },
]

/**
 * "Explore the site in detail without leaving this screen" — used both
 * inline on AdminReviewScreen's swipe card and as its own section on
 * AdminStopDetailScreen. Every interactive element here stops pointer
 * propagation: AdminReviewScreen's card listens for pointerdown/move on
 * itself to drive the swipe gesture, and without this a tap here gets
 * read as a drag (same class of bug already fixed on that card's other
 * buttons — see AdminReviewScreen's "Full details" / "other sites" links).
 */
export function SiteExplorer({ point, compact = false }: { point: LatLng; compact?: boolean }) {
  const [tab, setTab] = useState<'satellite' | 'street_view'>('satellite')
  const [zoom, setZoom] = useState<SatelliteZoomLevel>('close')

  const imageHeight = compact ? 'h-48' : 'h-80'

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
      </div>

      {tab === 'satellite' && (
        <div className="mt-2">
          <img
            src={satelliteImageUrl(point, zoom, compact ? 400 : 640)}
            alt="Satellite view of the site"
            className={`w-full ${imageHeight} rounded-lg object-cover`}
          />
          <div className="mt-1.5 flex gap-1.5">
            {ZOOM_LEVELS.map((z) => (
              <button
                key={z.value}
                type="button"
                onClick={() => setZoom(z.value)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  zoom === z.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
          {!isGoogleMapsConfigured && (
            <p className="mt-1.5 text-xs text-slate-400">
              Free Esri imagery — add a Google Maps key (docs/SETUP.md §13) for a sharper image.
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
              className={`w-full ${imageHeight} rounded-lg border-0`}
              loading="lazy"
              allowFullScreen
            />
          ) : (
            <div className={`flex w-full ${imageHeight} items-center justify-center rounded-lg bg-slate-100 p-4 text-center text-xs text-slate-500`}>
              Street View needs a Google Maps key — see docs/SETUP.md §13.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
