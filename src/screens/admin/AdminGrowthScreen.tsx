import { useEffect, useState } from 'react'
import { GROWTH_OPTION_CROWDFUND } from '../../data/growthOptions'
import { useAdminStore } from '../../store/useAdminStore'

export function AdminGrowthScreen() {
  const rows = useAdminStore((s) => s.growthFeedback)
  const loading = useAdminStore((s) => s.growthFeedbackLoading)
  const error = useAdminStore((s) => s.error)
  const loadGrowthFeedback = useAdminStore((s) => s.loadGrowthFeedback)
  const updateGrowthFeedback = useAdminStore((s) => s.updateGrowthFeedback)
  const [showActioned, setShowActioned] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void loadGrowthFeedback()
  }, [loadGrowthFeedback])

  async function toggle(id: string, patch: { actioned?: boolean; crmSynced?: boolean }) {
    setBusyId(id)
    try {
      await updateGrowthFeedback(id, patch)
    } finally {
      setBusyId(null)
    }
  }

  const visible = rows.filter((r) => showActioned || !r.actioned)

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-slate-900">Growth</h2>
      <p className="mt-1 text-sm text-slate-500">
        Submissions from the Support page's "Help us grow" options. Crowdfund interest needs
        tagging in Brevo by hand for now, there's no automatic CRM sync yet (see
        docs/SETUP.md §10a).
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showActioned}
          onChange={(e) => setShowActioned(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Show actioned too
      </label>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {!loading && (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((g) => {
            const wantsCrowdfund = g.options.includes(GROWTH_OPTION_CROWDFUND)
            return (
              <li key={g.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.options.map((option) => (
                        <span
                          key={option}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            option === GROWTH_OPTION_CROWDFUND
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-brand-50 text-brand-700'
                          }`}
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                    {g.message && (
                      <p className="mt-2 text-sm italic text-slate-700">"{g.message}"</p>
                    )}
                    <p className="mt-2 text-xs text-slate-500">
                      {g.email ?? 'No email on record'} · {new Date(g.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    {g.actioned && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        Actioned
                      </span>
                    )}
                    {wantsCrowdfund && (
                      <button
                        type="button"
                        disabled={busyId === g.id}
                        onClick={() => void toggle(g.id, { crmSynced: !g.crmSynced })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                          g.crmSynced
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {g.crmSynced ? 'Synced to CRM' : 'Mark synced to CRM'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === g.id}
                      onClick={() => void toggle(g.id, { actioned: !g.actioned })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                        g.actioned
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-brand-600 text-white'
                      }`}
                    >
                      {g.actioned ? 'Mark not actioned' : 'Mark actioned'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
          {visible.length === 0 && (
            <li className="rounded-xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
              No {showActioned ? '' : 'unactioned '}submissions.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
