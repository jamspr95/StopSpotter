import { TileLayer } from 'react-leaflet'

/** Shared OSM / satellite toggle for both the map and drop-pin screens. Free tile sources — no API key. */
export function MapTiles({ satellite }: { satellite: boolean }) {
  if (satellite) {
    return (
      <TileLayer
        attribution="Tiles &copy; Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
    )
  }
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  )
}

export function SatelliteToggle({
  satellite,
  onChange,
}: {
  satellite: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-slate-200 bg-white text-xs font-medium shadow-sm">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1.5 ${satellite ? 'text-slate-600' : 'bg-teal-600 text-white'}`}
      >
        Map
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1.5 ${satellite ? 'bg-teal-600 text-white' : 'text-slate-600'}`}
      >
        Satellite
      </button>
    </div>
  )
}
