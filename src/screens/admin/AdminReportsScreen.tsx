import { useEffect, useMemo, useState } from 'react'
import * as db from '../../lib/db'
import { downloadCsv } from '../../lib/csv'
import { formatEnumLabel, STATUS_LABEL } from '../../lib/labels'
import { useAdminStore } from '../../store/useAdminStore'
import type { AdminAnalyticsSummaryRow } from '../../types'

const EVENT_LABEL: Record<string, string> = {
  pageview: 'Pageviews',
  share_click: 'Share clicks',
  nomination_submit: 'Nominations',
  vote_submit: 'Votes',
  growth_feedback_submit: 'Growth feedback',
}

export function AdminReportsScreen() {
  const nominations = useAdminStore((s) => s.nominations)
  const loading = useAdminStore((s) => s.nominationsLoading)
  const loadNominations = useAdminStore((s) => s.loadNominations)
  const [councilFilter, setCouncilFilter] = useState('all')
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummaryRow[]>([])
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  useEffect(() => {
    if (nominations.length === 0) void loadNominations()
  }, [nominations.length, loadNominations])

  useEffect(() => {
    void db
      .adminAnalyticsSummary()
      .then(setAnalytics)
      .catch((err) => setAnalyticsError(err instanceof Error ? err.message : 'Failed to load analytics.'))
  }, [])

  const councilAreas = useMemo(() => {
    const set = new Set<string>()
    for (const n of nominations) if (n.councilArea) set.add(n.councilArea)
    return Array.from(set).sort()
  }, [nominations])

  const rows = useMemo(
    () =>
      councilFilter === 'all'
        ? nominations
        : nominations.filter((n) => n.councilArea === councilFilter),
    [nominations, councilFilter],
  )

  // n.payBand is null on a source='site_finder' row (no human willingness-
  // to-pay answer exists) — excluded here, not counted as "willing to pay".
  const willingToPay = rows.reduce(
    (sum, n) => sum + (n.voteCount > 0 && n.payBand != null && n.payBand !== 'free_only' ? 1 : 0),
    0,
  )

  function handleCsv() {
    downloadCsv(
      `stopspotter-demand-${councilFilter}.csv`,
      [
        'Created',
        'Place type',
        'Council area',
        'Status',
        'Score',
        'Flags',
        'Votes',
        'Pay band',
        'Source',
      ],
      rows.map((n) => [
        n.createdAt,
        n.answers.placeType,
        n.councilArea ?? '',
        n.status,
        n.criteria.score,
        n.criteria.flags.join('; '),
        n.voteCount,
        n.payBand,
        n.source,
      ]),
    )
  }

  async function handlePdf() {
    // Dynamic import: jsPDF (plus its own html2canvas/dompurify deps) would
    // otherwise land in the main bundle every visitor downloads, for a
    // feature only the admin dashboard uses — see the commit that added
    // this screen for the before/after bundle size.
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const title =
      councilFilter === 'all' ? 'StopSpotter demand report — all areas' : `StopSpotter demand report — ${councilFilter}`
    doc.setFontSize(16)
    doc.text(title, 14, 16)
    doc.setFontSize(10)
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 23)

    doc.setFontSize(11)
    doc.text(`${rows.length} stops`, 14, 32)
    doc.text(`${rows.reduce((sum, n) => sum + n.voteCount, 0)} total votes`, 14, 38)
    doc.text(`${willingToPay} stops with at least one paid-band vote`, 14, 44)

    let y = 56
    doc.setFontSize(9)
    doc.text('Place', 14, y)
    doc.text('Council area', 60, y)
    doc.text('Status', 110, y)
    doc.text('Score', 140, y)
    doc.text('Votes', 160, y)
    y += 5
    doc.line(14, y, 196, y)
    y += 5

    for (const n of rows) {
      if (y > 285) {
        doc.addPage()
        y = 16
      }
      doc.text(formatEnumLabel(n.answers.placeType, 'Potential stop'), 14, y)
      doc.text(n.councilArea ?? '—', 60, y)
      doc.text(STATUS_LABEL[n.status], 110, y)
      doc.text(String(n.criteria.score), 140, y)
      doc.text(String(n.voteCount), 160, y)
      y += 6
    }

    doc.save(`stopspotter-demand-${councilFilter}.pdf`)
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-slate-900">Demand report</h2>
      <p className="mt-1 text-sm text-slate-500">
        Export the current stop list — all areas, or one council area at a time.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-medium text-slate-500">Council area</label>
          <select
            value={councilFilter}
            onChange={(e) => setCouncilFilter(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm sm:w-auto"
          >
            <option value="all">All areas</option>
            {councilAreas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={loading || rows.length === 0}
          onClick={handleCsv}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40 sm:flex-none"
        >
          Download CSV
        </button>
        <button
          type="button"
          disabled={loading || rows.length === 0}
          onClick={() => void handlePdf()}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none"
        >
          Download PDF
        </button>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {!loading && (
        <p className="mt-4 text-sm text-slate-600">
          {rows.length} stops, {rows.reduce((sum, n) => sum + n.voteCount, 0)} total votes,{' '}
          {willingToPay} with at least one paid-band vote.
        </p>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold text-slate-900">Funnel &amp; campaigns</h2>
      <p className="mt-1 text-sm text-slate-500">
        Cookieless event counts — no third-party analytics, just pageviews/shares/conversions
        logged to Supabase and broken down by the <code>utm_campaign</code>/<code>utm_source</code>{' '}
        a visitor first arrived with.
      </p>

      {analyticsError && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{analyticsError}</p>
      )}

      {!analyticsError && (
        <>
          <table className="mt-4 hidden w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm md:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                <th className="p-3">Event</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Count</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map((row) => (
                <tr key={`${row.eventType}-${row.campaign ?? 'none'}`} className="border-b border-slate-100 last:border-0">
                  <td className="p-3 text-slate-800">{EVENT_LABEL[row.eventType] ?? row.eventType}</td>
                  <td className="p-3 text-slate-600">{row.campaign ?? '— (no campaign tag)'}</td>
                  <td className="p-3 text-slate-600">{row.eventCount}</td>
                </tr>
              ))}
              {analytics.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-slate-400">
                    No events logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <ul className="mt-4 flex flex-col gap-2 md:hidden">
            {analytics.map((row) => (
              <li
                key={`${row.eventType}-${row.campaign ?? 'none'}`}
                className="flex items-center justify-between rounded-xl bg-white p-3 text-sm shadow-sm"
              >
                <div>
                  <p className="font-medium text-slate-800">{EVENT_LABEL[row.eventType] ?? row.eventType}</p>
                  <p className="text-xs text-slate-500">{row.campaign ?? '— (no campaign tag)'}</p>
                </div>
                <span className="font-semibold text-slate-700">{row.eventCount}</span>
              </li>
            ))}
            {analytics.length === 0 && (
              <li className="rounded-xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
                No events logged yet.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
