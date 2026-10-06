import type { LatLng } from '../types'

const EARTH_RADIUS_M = 6371000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in metres. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return EARTH_RADIUS_M * c
}

/**
 * Snaps a public-facing marker to a ~1km grid so exact locations stay
 * private (see docs/BUILD_PLAN.md "Map visibility, moderation and
 * anti-gaming"). Admin-only views should always use the exact coordinates.
 */
export function snapToPublicGrid(point: LatLng): LatLng {
  const GRID_DEG_LAT = 0.009 // ~1km
  const gridDegLng = 0.009 / Math.cos(toRad(point.lat)) // ~1km, longitude-corrected

  return {
    lat: Math.round(point.lat / GRID_DEG_LAT) * GRID_DEG_LAT,
    lng: Math.round(point.lng / gridDegLng) * gridDegLng,
  }
}

const DUPLICATE_RADIUS_M = 200

/** Finds an existing nomination within the 200m duplicate-pin radius, if any. */
export function findDuplicateWithin200m<T extends { exact: LatLng }>(
  point: LatLng,
  nominations: T[],
): T | undefined {
  return nominations.find((n) => distanceMetres(point, n.exact) <= DUPLICATE_RADIUS_M)
}

/**
 * Placeholder for the real ONS local authority boundary lookup
 * (docs/BUILD_PLAN.md Milestone 2). The prototype has no boundary data yet,
 * so it returns a fixed label rather than guessing a real council name.
 */
export function guessCouncilArea(_point: LatLng): string {
  return 'Council area — to be confirmed (needs ONS boundary data, Milestone 2)'
}
