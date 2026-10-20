import { useEffect, useMemo, useState } from 'react'
import { GeoJSON, MapContainer, Marker } from 'react-leaflet'
import { MapTiles, SatelliteToggle } from '../../components/MapTiles'
import { SiteExplorer } from '../../components/SiteExplorer'
import { formatEnumLabel } from '../../lib/labels'
import { useAdminStore } from '../../store/useAdminStore'
import type { OwnerType } from '../../types'

/**
 * Replaces SiteFinder's own standalone web/app.py map+review — one portal
 * instead of two (Jamie, 20 Oct 2026). Every pipeline candidate lands in
 * site_finder_raw_candidates (scripts/sync-sitefinder-raw-candidates.mjs,
 * run by hand after a SiteFinder pipeline run), browsed/filtered/mapped
 * here, with Approve/Reject the only way a candidate ever reaches
 * StopSpotter's own `nominations` table (admin_approve_site_finder_candidate,
 * supabase/migrations/0024_site_finder_raw_candidates.sql) — nothing here
 * writes to it just by being previewed.
 */
type StatusFilter = 'pending' | 'approved' | 'rejected'

function scorePercent(score: number | null): string {
  return score == null ? '—' : `${Math.round(score * 100)}%`
}

export function AdminSiteFinderSearchScreen() {
  const candidates = useAdminStore((s) => s.siteFinderRawCandidates)
  const loading = useAdminStore((s) => s.siteFinderRawCandidatesLoading)
  const approvingId = useAdminStore((s) => s.siteFinderApprovingId)
  const error = useAdminStore((s) => s.error)
  const loadCandidates = useAdminStore((s) => s.loadSiteFinderRawCandidates)
  const approve = useAdminStore((s) => s.approveSiteFinderCandidate)
  const reject = useAdminStore((s) => s.rejectSiteFinderCandidate)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [areaFilter, setAreaFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState<Set<OwnerType>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [satellite, setSatellite] = useState(false)

  useEffect(() => {
    void loadCandidates(statusFilter)
    setSelectedId(null)
  }, [loadCandidates, statusFilter])

  const areas = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const c of candidates) byKey.set(c.areaKey, c.areaLabel)
    return Array.from(byKey.entries())
  }, [candidates])

  const ownerTypes = useMemo(
    () => Array.from(new Set(candidates.map((c) => c.ownerType).filter((v): v is OwnerType => v != null))),
    [candidates],
  )

  const filtered = useMemo(
    () =>
      candidates
        .filter((c) => areaFilter === 'all' || c.areaKey === areaFilter)
        .filter((c) => ownerFilter.size === 0 || (c.ownerType && ownerFilter.has(c.ownerType)))
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [candidates, areaFilter, ownerFilter],
  )

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null

  function toggleOwner(owner: OwnerType) {
    setOwnerFilter((prev) => {
      const next = new Set(prev)
      if (next.has(owner)) next.delete(owner)
      else next.add(owner)
      return next
    })
  }

  async function handleApprove(id: string) {
    await approve(id)
  }

  async function handleReject(id: string) {
    const reason = window.prompt('Why reject this candidate? (optional)') ?? undefined
    await reject(id, reason || undefined)
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-slate-900">SiteFinder search</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Every candidate SiteFinder's pipeline has found, straight from its own processed data —
        nothing here is in StopSpotter's own nominations yet. Approve a candidate to bring it into
        the normal admin review queue; reject to dismiss it without deleting anything SiteFinder
        produced.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-full bg-white text-xs font-medium shadow-sm">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 capitalize ${
                statusFilter === s ? 'bg-brand-600 text-white' : 'text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="rounded-lg border border-slate-200 p-2 text-sm"
        >
          <option value="all">All areas</option>
          {areas.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        {ownerTypes.map((owner) => (
          <label key={owner} className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={ownerFilter.has(owner)}
              onChange={() => toggleOwner(owner)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {formatEnumLabel(owner)}
          </label>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <p className="mt-4 rounded-xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
          No {statusFilter} candidates{areaFilter !== 'all' ? ' in this area' : ''} — has
          scripts/sync-sitefinder-raw-candidates.mjs been run yet?
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="h-96 overflow-hidden rounded-xl border border-slate-200">
              <div className="relative h-full">
                <MapContainer
                  center={selected?.exact ?? filtered[0].exact}
                  zoom={13}
                  className="z-0 h-full w-full"
                  zoomControl={false}
                >
                  <MapTiles satellite={satellite} />
                  {filtered.map((c) => (
                    <Marker key={c.id} position={c.exact} eventHandlers={{ click: () => setSelectedId(c.id) }} />
                  ))}
                  {selected?.siteBoundary && (
                    // key forces a remount when the selection changes — see
                    // AdminStopDetailScreen's own title-boundary GeoJSON for
                    // why react-leaflet needs this.
                    <GeoJSON
                      key={selected.id}
                      data={selected.siteBoundary}
                      style={{ color: '#a15a0a', weight: 2, fillOpacity: 0.15 }}
                    />
                  )}
                </MapContainer>
                <div className="absolute left-3 top-3 z-10">
                  <SatelliteToggle satellite={satellite} onChange={setSatellite} />
                </div>
              </div>
            </div>

            <ul className="mt-3 max-h-80 overflow-y-auto rounded-xl bg-white shadow-sm">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-0 ${
                      selected?.id === c.id ? 'bg-amber-50' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {c.ownerName ?? c.propertyName ?? formatEnumLabel(c.ownerType, 'Unknown owner')}
                      <span className="ml-2 text-xs text-slate-400">{c.areaLabel}</span>
                    </span>
                    <span className="flex-shrink-0 text-xs font-semibold text-slate-500">
                      {scorePercent(c.score)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2">
              <p className="text-sm font-semibold text-slate-900">
                {selected.ownerName ?? selected.propertyName ?? 'Unknown owner'}
              </p>
              <p className="text-xs text-slate-500">
                {selected.areaLabel} · score {scorePercent(selected.score)}
              </p>

              {selected.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selected.flags.map((flag) => (
                    <span key={flag} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {formatEnumLabel(flag)}
                    </span>
                  ))}
                </div>
              )}

              {selected.reasons.length > 0 && (
                <ul className="mt-3 list-disc pl-4 text-sm text-slate-600">
                  {selected.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <dt className="text-slate-400">Owner type</dt>
                  <dd>{formatEnumLabel(selected.ownerType)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Ownership confidence</dt>
                  <dd>{formatEnumLabel(selected.ownershipConfidenceDetail)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Usable area</dt>
                  <dd>{selected.usableAreaM2 ? `${Math.round(selected.usableAreaM2)} m²` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Capacity</dt>
                  <dd>{selected.capacityPitches ?? '—'} pitches</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Slope</dt>
                  <dd>{selected.avgSlopePercent != null ? `${selected.avgSlopePercent}%` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Road access</dt>
                  <dd>{formatEnumLabel(selected.roadAccess)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Coast distance</dt>
                  <dd>{selected.coastDistanceM != null ? `${Math.round(selected.coastDistanceM)} m` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Utilities</dt>
                  <dd>{formatEnumLabel(selected.utilityStatus)}</dd>
                </div>
              </dl>

              {Object.keys(selected.componentScores).length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Score breakdown</p>
                  <ul className="mt-1 text-xs text-slate-600">
                    {Object.entries(selected.componentScores).map(([key, value]) => (
                      <li key={key} className="flex justify-between">
                        <span>{formatEnumLabel(key)}</span>
                        <span>{Math.round(value * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3">
                <SiteExplorer key={`${selected.exact.lat}-${selected.exact.lng}`} point={selected.exact} compact />
              </div>

              {selected.status === 'rejected' && selected.rejectedReason && (
                <p className="mt-3 text-xs text-slate-400">Rejected: {selected.rejectedReason}</p>
              )}

              {statusFilter === 'pending' && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={approvingId === selected.id}
                    onClick={() => void handleApprove(selected.id)}
                    className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {approvingId === selected.id ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={approvingId === selected.id}
                    onClick={() => void handleReject(selected.id)}
                    className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
