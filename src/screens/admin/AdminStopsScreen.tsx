import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/labels'
import { useAdminStore } from '../../store/useAdminStore'
import type { NominationStatus } from '../../types'

type SortKey = 'created_desc' | 'votes_desc' | 'score_desc'

export function AdminStopsScreen() {
  const navigate = useNavigate()
  const nominations = useAdminStore((s) => s.nominations)
  const loading = useAdminStore((s) => s.nominationsLoading)
  const error = useAdminStore((s) => s.error)
  const loadNominations = useAdminStore((s) => s.loadNominations)

  const [councilFilter, setCouncilFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<NominationStatus | 'all'>('all')
  const [minScore, setMinScore] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('created_desc')

  useEffect(() => {
    void loadNominations()
  }, [loadNominations])

  const councilAreas = useMemo(() => {
    const set = new Set<string>()
    for (const n of nominations) if (n.councilArea) set.add(n.councilArea)
    return Array.from(set).sort()
  }, [nominations])

  const filtered = useMemo(() => {
    const min = minScore === '' ? null : Number(minScore)
    let rows = nominations.filter((n) => {
      if (councilFilter !== 'all' && n.councilArea !== councilFilter) return false
      if (statusFilter !== 'all' && n.status !== statusFilter) return false
      if (min !== null && n.criteria.score < min) return false
      if (flaggedOnly && n.criteria.flags.length === 0) return false
      return true
    })
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'votes_desc':
          return b.voteCount - a.voteCount
        case 'score_desc':
          return b.criteria.score - a.criteria.score
        default:
          return b.createdAt.localeCompare(a.createdAt)
      }
    })
    return rows
  }, [nominations, councilFilter, statusFilter, minScore, flaggedOnly, sortKey])

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-slate-900">Stops</h2>
      <p className="mt-1 text-sm text-slate-500">{filtered.length} of {nominations.length} stops</p>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-500">Council area</label>
          <select
            value={councilFilter}
            onChange={(e) => setCouncilFilter(e.target.value)}
            className="mt-1 rounded-lg border border-slate-200 p-2 text-sm"
          >
            <option value="all">All</option>
            {councilAreas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as NominationStatus | 'all')}
            className="mt-1 rounded-lg border border-slate-200 p-2 text-sm"
          >
            <option value="all">All</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500">Min score</label>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="mt-1 w-20 rounded-lg border border-slate-200 p-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Flagged only
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-500">Sort by</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="mt-1 rounded-lg border border-slate-200 p-2 text-sm"
          >
            <option value="created_desc">Newest first</option>
            <option value="votes_desc">Most votes</option>
            <option value="score_desc">Highest score</option>
          </select>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {!loading && (
        <table className="mt-4 w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
              <th className="p-3">Created</th>
              <th className="p-3">Place</th>
              <th className="p-3">Council area</th>
              <th className="p-3">Status</th>
              <th className="p-3">Score</th>
              <th className="p-3">Flags</th>
              <th className="p-3">Votes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <tr
                key={n.id}
                onClick={() => navigate(`/admin/stop/${n.id}`)}
                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="p-3 text-slate-500">
                  {new Date(n.createdAt).toLocaleDateString()}
                </td>
                <td className="p-3 capitalize text-slate-800">
                  {n.answers.placeType.replace('_', ' ')}
                </td>
                <td className="p-3 text-slate-600">{n.councilArea ?? '—'}</td>
                <td className="p-3">
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {STATUS_LABEL[n.status]}
                  </span>
                </td>
                <td className="p-3 text-slate-600">{n.criteria.score}</td>
                <td className="p-3 text-slate-600">{n.criteria.flags.length || '—'}</td>
                <td className="p-3 text-slate-600">{n.voteCount}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  No stops match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
