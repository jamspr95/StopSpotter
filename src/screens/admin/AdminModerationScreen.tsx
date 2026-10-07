import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_LABEL } from '../../lib/labels'
import { useAdminStore } from '../../store/useAdminStore'

export function AdminModerationScreen() {
  const navigate = useNavigate()
  const reports = useAdminStore((s) => s.moderationReports)
  const loading = useAdminStore((s) => s.moderationLoading)
  const error = useAdminStore((s) => s.error)
  const loadModerationReports = useAdminStore((s) => s.loadModerationReports)
  const resolveModerationReport = useAdminStore((s) => s.resolveModerationReport)
  const [includeResolved, setIncludeResolved] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  useEffect(() => {
    void loadModerationReports(includeResolved)
  }, [loadModerationReports, includeResolved])

  async function handleResolve(reportId: string) {
    setResolvingId(reportId)
    try {
      await resolveModerationReport(reportId)
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-slate-900">Moderation</h2>
      <p className="mt-1 text-sm text-slate-500">
        User-submitted reports on stops. Automatic content flagging isn't implemented yet (see
        docs/BUILD_PLAN.md) — this is manual reports only.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={includeResolved}
          onChange={(e) => setIncludeResolved(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Show resolved reports too
      </label>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {!loading && (
        <ul className="mt-4 flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">{r.reason}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.nominationPlaceType.replace('_', ' ')} · {r.nominationCouncilArea ?? 'Unknown council area'} ·{' '}
                    {STATUS_LABEL[r.nominationStatus]} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {r.nominationWhyHere && (
                    <p className="mt-2 text-sm italic text-slate-600">"{r.nominationWhyHere}"</p>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                  {r.resolved && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Resolved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/stop/${r.nominationId}`)}
                    className="text-xs font-medium text-brand-700 underline"
                  >
                    View stop
                  </button>
                  {!r.resolved && (
                    <button
                      type="button"
                      disabled={resolvingId === r.id}
                      onClick={() => void handleResolve(r.id)}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {resolvingId === r.id ? 'Resolving…' : 'Resolve'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
          {reports.length === 0 && (
            <li className="rounded-xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
              No {includeResolved ? '' : 'unresolved '}reports.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
