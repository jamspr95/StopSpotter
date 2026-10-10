import { useEffect, useState } from 'react'
import { MapContainer, Marker } from 'react-leaflet'
import { useNavigate, useParams } from 'react-router-dom'
import { MapTiles, SatelliteToggle } from '../../components/MapTiles'
import { SiteExplorer } from '../../components/SiteExplorer'
import * as db from '../../lib/db'
import { formatEnumLabel, SOURCE_LABEL, STATUS_LABEL, STATUS_ORDER } from '../../lib/labels'
import { useAdminStore } from '../../store/useAdminStore'
import type { AdminLandownerLead, AdminStatusHistoryEntry, NominationStatus } from '../../types'

const HOW_KNOWN_LABEL: Record<string, string> = {
  i_own_it: 'Says they own it',
  i_know_them: 'Knows the owner',
  public_information: 'Found via public information',
  dont_know: "Doesn't know the owner",
}

export function AdminStopDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const nominations = useAdminStore((s) => s.nominations)
  const loadNominations = useAdminStore((s) => s.loadNominations)
  const updateNominationStatus = useAdminStore((s) => s.updateNominationStatus)

  const [satellite, setSatellite] = useState(true)
  const [leads, setLeads] = useState<AdminLandownerLead[]>([])
  const [history, setHistory] = useState<AdminStatusHistoryEntry[]>([])
  const [newStatus, setNewStatus] = useState<NominationStatus | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (nominations.length === 0) void loadNominations()
  }, [nominations.length, loadNominations])

  const nomination = nominations.find((n) => n.id === id)

  // Same "a reliable spotter or a one-off" context as the review card
  // (AdminReviewScreen), shown here in full rather than collapsed — only
  // meaningful for a claimed submitter, since an anonymous/deleted-account
  // userId is null and would otherwise match every other anonymous/
  // deleted nomination, not just this one person's.
  const otherSubmissions = nomination?.userId
    ? nominations.filter((n) => n.userId === nomination.userId && n.id !== nomination.id)
    : []

  useEffect(() => {
    if (!id) return
    void db.adminListLandownerLeads(id).then(setLeads).catch(() => setLeads([]))
    void db.adminListStatusHistory(id).then(setHistory).catch(() => setHistory([]))
  }, [id])

  if (!nomination) {
    return (
      <div>
        <button onClick={() => navigate('/admin')} className="text-sm text-brand-700 underline">
          ← Back to stops
        </button>
        <p className="mt-4 text-sm text-slate-500">
          Stop not found (or still loading — try going back to the list first).
        </p>
      </div>
    )
  }

  async function handleStatusUpdate() {
    if (!newStatus || !id) return
    setSaving(true)
    setError(null)
    try {
      await updateNominationStatus(id, newStatus, note || undefined)
      const freshHistory = await db.adminListStatusHistory(id)
      setHistory(freshHistory)
      setNote('')
      setNewStatus('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate('/admin')} className="text-sm text-brand-700 underline">
        ← Back to stops
      </button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold capitalize text-slate-900">
            {formatEnumLabel(nomination.answers.placeType, 'Potential stop')}
          </h2>
          <p className="text-sm text-slate-500">{nomination.councilArea ?? 'Council area unknown'}</p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          {STATUS_LABEL[nomination.status]}
        </span>
      </div>

      <div className="mt-4 h-72 overflow-hidden rounded-xl border border-slate-200">
        <div className="relative h-full">
          {/* z-0 contains Leaflet's internal panes/controls so the toggle
              below reliably paints above the map — see DropPinScreen/MapScreen. */}
          <MapContainer center={nomination.exact} zoom={16} className="z-0 h-full w-full" zoomControl={false}>
            <MapTiles satellite={satellite} />
            <Marker position={nomination.exact} />
          </MapContainer>
          <div className="absolute left-3 top-3 z-10">
            <SatelliteToggle satellite={satellite} onChange={setSatellite} />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700">Explore</h3>
        <div className="mt-2">
          <SiteExplorer point={nomination.exact} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-white p-4 shadow-sm md:grid-cols-4">
        <Stat label="Score" value={String(nomination.criteria.score)} />
        <Stat label="Votes" value={String(nomination.voteCount)} />
        <Stat label="Pay band" value={formatEnumLabel(nomination.payBand, 'no pay answer')} />
        <Stat label="Source" value={SOURCE_LABEL[nomination.source]} />
      </div>

      {nomination.criteria.flags.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Flags</p>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
            {nomination.criteria.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-white p-4 text-sm shadow-sm md:grid-cols-3">
        <Field label="Owner type" value={nomination.answers.ownerType.replace(/_/g, ' ')} />
        <Field label="Nearest house" value={formatEnumLabel(nomination.answers.nearestHouse)} />
        <Field label="Slope" value={formatEnumLabel(nomination.answers.slope)} />
        <Field label="Room for five" value={nomination.answers.roomForFive.replace(/_/g, ' ')} />
        <Field label="Water" value={formatEnumLabel(nomination.answers.water)} />
        <Field label="Nearby" value={nomination.answers.nearby.filter((n) => n !== 'none').join(', ') || '—'} />
        <Field label="Ownership hint" value={nomination.ownershipHint || '—'} />
        <Field label="Verified" value={nomination.verified ? 'Yes' : 'No'} />
      </div>

      {nomination.source !== 'user' && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700">AireStop (SiteFinder) detail</h3>
          <div className="mt-2 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Field
              label="AireStop score"
              value={nomination.siteFinderScore != null ? `${Math.round(nomination.siteFinderScore * 100)}%` : '—'}
            />
            <Field label="Ownership confidence" value={formatEnumLabel(nomination.ownershipConfidenceDetail)} />
            <Field
              label="Usable area"
              value={nomination.usableAreaM2 != null ? `${Math.round(nomination.usableAreaM2)} m²` : '—'}
            />
            <Field
              label="Capacity"
              value={nomination.capacityPitches != null ? `${nomination.capacityPitches} pitches` : '—'}
            />
            <Field
              label="Avg slope"
              value={nomination.avgSlopePercent != null ? `${nomination.avgSlopePercent.toFixed(1)}%` : '—'}
            />
            <Field label="Slope source" value={nomination.slopeSource || '—'} />
            <Field label="Road access" value={formatEnumLabel(nomination.roadAccess)} />
            <Field
              label="Coast distance"
              value={nomination.coastDistanceM != null ? `${(nomination.coastDistanceM / 1000).toFixed(1)} km` : '—'}
            />
          </div>
          {nomination.siteFinderFlags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
              {nomination.siteFinderFlags.map((f) => (
                <li key={f} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {nomination.whyHere && (
        <div className="mt-4 rounded-xl bg-white p-4 text-sm italic text-slate-700 shadow-sm">
          "{nomination.whyHere}"
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700">Submitter</h3>
        {!nomination.submitterWasClaimed ? (
          <p className="mt-2 text-sm text-slate-700">
            {nomination.source === 'site_finder' ? "Found by AireStop's automated scan — no human submitter" : 'Anonymous'}
          </p>
        ) : !nomination.submitterEmail ? (
          <p className="mt-2 text-sm text-slate-700">Account deleted</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Email</p>
              <p className="mt-0.5 text-slate-700">{nomination.submitterEmail}</p>
            </div>
            <Field label="First name" value={nomination.submitterFirstName || '—'} />
          </div>
        )}

        {otherSubmissions.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500">
              {otherSubmissions.length} other {otherSubmissions.length === 1 ? 'site' : 'sites'} from this
              submitter
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {otherSubmissions.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/stop/${n.id}`)}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-50 p-3 text-sm active:bg-slate-100"
                  >
                    <span>
                      <span className="font-medium capitalize text-slate-800">
                        {formatEnumLabel(n.answers.placeType, 'Potential stop')}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      {STATUS_LABEL[n.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700">Landowner leads</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {leads.map((l) => (
              <li key={l.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">{l.ownerNameOrOrg || 'No name given'}</p>
                <p className="text-slate-500">{l.howKnown ? HOW_KNOWN_LABEL[l.howKnown] : '—'}</p>
                {l.contact && <p className="text-slate-500">Contact: {l.contact}</p>}
                <p className="text-slate-400">
                  {l.happyToBeContacted ? 'Happy to be contacted' : 'Not confirmed happy to be contacted'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700">Change status</h3>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as NominationStatus)}
            className="rounded-lg border border-slate-200 p-2 text-sm"
          >
            <option value="">Select a new status…</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 p-2 text-sm"
          />
          <button
            type="button"
            disabled={!newStatus || saving}
            onClick={() => void handleStatusUpdate()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Update'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

        {history.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {h.fromStatus ? STATUS_LABEL[h.fromStatus] : '—'} → {STATUS_LABEL[h.toStatus]}
                </span>
                {' · '}
                {new Date(h.createdAt).toLocaleString()}
                {h.changedBy && ` · ${h.changedBy}`}
                {h.note && ` · "${h.note}"`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold capitalize text-slate-800">{value}</p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 capitalize text-slate-700">{value}</p>
    </div>
  )
}
