import { useEffect, useMemo, useState } from 'react'
import { downloadCsv } from '../../lib/csv'
import { STATUS_LABEL } from '../../lib/labels'
import { useAdminStore } from '../../store/useAdminStore'

export function AdminReportsScreen() {
  const nominations = useAdminStore((s) => s.nominations)
  const loading = useAdminStore((s) => s.nominationsLoading)
  const loadNominations = useAdminStore((s) => s.loadNominations)
  const [councilFilter, setCouncilFilter] = useState('all')

  useEffect(() => {
    if (nominations.length === 0) void loadNominations()
  }, [nominations.length, loadNominations])

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

  const willingToPay = rows.reduce(
    (sum, n) => sum + (n.voteCount > 0 && n.payBand !== 'free_only' ? 1 : 0),
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
      doc.text(n.answers.placeType.replace(/_/g, ' '), 14, y)
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
        <div>
          <label className="block text-xs font-medium text-slate-500">Council area</label>
          <select
            value={councilFilter}
            onChange={(e) => setCouncilFilter(e.target.value)}
            className="mt-1 rounded-lg border border-slate-200 p-2 text-sm"
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
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Download CSV
        </button>
        <button
          type="button"
          disabled={loading || rows.length === 0}
          onClick={() => void handlePdf()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
    </div>
  )
}
