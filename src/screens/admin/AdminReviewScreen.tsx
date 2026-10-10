import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { SiteExplorer } from '../../components/SiteExplorer'
import { formatEnumLabel, SOURCE_LABEL, STATUS_LABEL } from '../../lib/labels'
import { satelliteImageUrl } from '../../lib/satelliteImage'
import { useAdminStore } from '../../store/useAdminStore'
import type { AdminNomination, NominationStatus } from '../../types'

const SWIPE_COMMIT_PX = 120
const EXIT_ANIMATION_MS = 220

type Action = 'not_suitable' | 'under_review' | 'shortlist'
type Direction = 'left' | 'up' | 'right'

const ACTION_STATUS: Record<Action, NominationStatus> = {
  not_suitable: 'not_suitable',
  under_review: 'under_review',
  shortlist: 'shortlisted',
}

const ACTION_DIRECTION: Record<Action, Direction> = {
  not_suitable: 'left',
  under_review: 'up',
  shortlist: 'right',
}

/**
 * Rapid triage queue for freshly-submitted stops — a dating-app-style card
 * stack instead of the Stops table, for when an admin just wants to work
 * through "needs a first look" quickly: swipe (or tap) left to mark not
 * suitable, right to shortlist, up to park it as under review for a closer
 * look later. Full detail/history/status-note editing stays on the Stops
 * table → stop detail page; this is deliberately the fast, low-detail path.
 */
export function AdminReviewScreen() {
  const navigate = useNavigate()
  const nominations = useAdminStore((s) => s.nominations)
  const loading = useAdminStore((s) => s.nominationsLoading)
  const error = useAdminStore((s) => s.error)
  const loadNominations = useAdminStore((s) => s.loadNominations)
  const updateNominationStatus = useAdminStore((s) => s.updateNominationStatus)

  useEffect(() => {
    if (nominations.length === 0) void loadNominations()
  }, [nominations.length, loadNominations])

  // Strongest candidates first — the ones most worth an admin's limited
  // triage time. "Needs a first look" means status is still 'submitted';
  // anything already under_review/shortlisted/etc. has already been seen.
  const submittedQueue = useMemo(
    () =>
      nominations
        .filter((n) => n.status === 'submitted')
        .sort((a, b) => b.criteria.score - a.criteria.score),
    [nominations],
  )

  const [flyingOut, setFlyingOut] = useState<{ nomination: AdminNomination; direction: Direction } | null>(null)
  const [lastAction, setLastAction] = useState<{ id: string; previousStatus: NominationStatus; label: string } | null>(null)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Holds the id of the card it's open for, not a plain boolean — so
  // moving to the next card closes it automatically (derived, not reset
  // via an effect) instead of carrying the previous card's open state over.
  const [otherSitesOpenFor, setOtherSitesOpenFor] = useState<string | null>(null)
  // Same "holds the id, not a boolean" reasoning as otherSitesOpenFor —
  // moving to the next card should close this too, not carry it over.
  const [exploreOpenFor, setExploreOpenFor] = useState<string | null>(null)
  const pointerActive = useRef(false)
  const dragStartX = useRef(0)

  // The card mid-exit-animation stays on top of the stack even once its
  // status (and therefore its place in submittedQueue) has already changed
  // underneath it — otherwise a fast store update could cut the fly-out
  // animation short or skip it entirely.
  const displayQueue = flyingOut
    ? [flyingOut.nomination, ...submittedQueue.filter((n) => n.id !== flyingOut.nomination.id)]
    : submittedQueue

  const top = displayQueue[0]
  const second = displayQueue[1]
  const third = displayQueue[2]

  // Other nominations from the same submitter — "a reliable spotter or a
  // one-off" at a glance (design spec). Only meaningful for a claimed
  // submitter: an anonymous/deleted-account userId is null, which would
  // otherwise match every other anonymous/deleted nomination, not just
  // this one person's.
  const otherSubmissions = useMemo(() => {
    if (!top?.userId) return []
    return nominations.filter((n) => n.userId === top.userId && n.id !== top.id)
  }, [nominations, top])
  const showOtherSites = top !== undefined && otherSitesOpenFor === top.id
  const showExplore = top !== undefined && exploreOpenFor === top.id

  async function commit(action: Action) {
    if (!top || flyingOut) return
    const direction = ACTION_DIRECTION[action]
    const previousStatus = top.status
    setFlyingOut({ nomination: top, direction })
    setDragX(0)
    setDragging(false)
    window.setTimeout(() => setFlyingOut(null), EXIT_ANIMATION_MS)

    try {
      await updateNominationStatus(top.id, ACTION_STATUS[action])
      setLastAction({ id: top.id, previousStatus, label: STATUS_LABEL[ACTION_STATUS[action]] })
    } catch (err) {
      // The store's nominations array is untouched on failure, so this stop
      // is still genuinely 'submitted' — it just reappears once flyingOut
      // clears, same as if nothing had happened.
      console.error('StopSpotter admin: failed to update stop status.', err)
    }
  }

  async function handleUndo() {
    if (!lastAction) return
    const { id, previousStatus } = lastAction
    setLastAction(null)
    try {
      await updateNominationStatus(id, previousStatus)
    } catch (err) {
      console.error('StopSpotter admin: undo failed.', err)
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!top || flyingOut) return
    pointerActive.current = true
    dragStartX.current = e.clientX
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerActive.current) return
    setDragX(e.clientX - dragStartX.current)
  }

  function handlePointerUp() {
    if (!pointerActive.current) return
    pointerActive.current = false
    setDragging(false)
    if (dragX > SWIPE_COMMIT_PX) {
      void commit('shortlist')
    } else if (dragX < -SWIPE_COMMIT_PX) {
      void commit('not_suitable')
    } else {
      setDragX(0)
    }
  }

  const topStyle: CSSProperties = flyingOut
    ? {
        transform:
          flyingOut.direction === 'left'
            ? 'translateX(-140%) rotate(-20deg)'
            : flyingOut.direction === 'right'
              ? 'translateX(140%) rotate(20deg)'
              : 'translateY(-120%) scale(0.92)',
        opacity: 0,
        transition: `transform ${EXIT_ANIMATION_MS}ms ease-in, opacity ${EXIT_ANIMATION_MS}ms ease-in`,
      }
    : {
        transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
        transition: dragging ? 'none' : 'transform 200ms ease',
      }

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold text-slate-900">Review</h2>
        <span className="text-sm text-slate-500">{submittedQueue.length} waiting</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Fresh submissions, strongest first. Swipe or tap: ✕ not suitable, ↑ under review, ✓ shortlist.
      </p>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {!loading && !top && (
        <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🎉</p>
          <p className="mt-2 font-medium text-slate-800">All caught up</p>
          <p className="mt-1 text-sm text-slate-500">Nothing new waiting for a first look.</p>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="mt-4 text-sm font-medium text-brand-700 underline"
          >
            View the full stops list
          </button>
        </div>
      )}

      {!loading && top && (
        <>
          <div className="relative mt-5 h-[480px]">
            {third && (
              <div className="absolute inset-x-3 top-6 h-full scale-[0.94] rounded-2xl bg-white opacity-50 shadow" />
            )}
            {second && (
              <div className="absolute inset-x-1.5 top-3 h-full scale-[0.97] rounded-2xl bg-white opacity-75 shadow" />
            )}

            <div
              className="absolute inset-0 touch-none select-none overflow-hidden rounded-2xl bg-white shadow-lg"
              style={topStyle}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {dragX > 40 && (
                <div className="absolute left-4 top-6 z-10 rotate-[-12deg] rounded-lg border-4 border-emerald-500 px-3 py-1 text-xl font-extrabold text-emerald-500">
                  SHORTLIST
                </div>
              )}
              {dragX < -40 && (
                <div className="absolute right-4 top-6 z-10 rotate-[12deg] rounded-lg border-4 border-red-500 px-3 py-1 text-xl font-extrabold text-red-500">
                  PASS
                </div>
              )}

              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setExploreOpenFor(showExplore ? null : top.id)}
                className="relative block h-36 w-full flex-shrink-0 overflow-hidden bg-slate-200"
              >
                <img
                  src={satelliteImageUrl(top.exact, 'wide')}
                  alt="Satellite view of the site"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                  {showExplore ? 'Hide explore ▲' : 'Explore ▾'}
                </span>
              </button>

              <div className="flex h-[calc(100%-9rem)] flex-col overflow-y-auto p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold capitalize text-slate-900">
                    {formatEnumLabel(top.answers.placeType, 'Potential stop')}
                  </h3>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    {top.source !== 'user' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {SOURCE_LABEL[top.source]}
                      </span>
                    )}
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      Score {top.criteria.score}
                      {top.siteFinderScore != null && ` · AireStop ${Math.round(top.siteFinderScore * 100)}%`}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-500">
                  {top.areaLabel ? `Near ${top.areaLabel}` : (top.councilArea ?? 'Area unknown')}
                </p>

                {showExplore && (
                  <div className="mt-3">
                    <SiteExplorer point={top.exact} compact />
                  </div>
                )}

                {top.criteria.flags.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {top.criteria.flags.map((f) => (
                      <li key={f} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                {top.whyHere && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-sm italic text-slate-700">"{top.whyHere}"</p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <Field label="Owner" value={top.answers.ownerType.replace(/_/g, ' ')} />
                  <Field label="Nearest house" value={formatEnumLabel(top.answers.nearestHouse)} />
                  <Field label="Slope" value={formatEnumLabel(top.answers.slope)} />
                  <Field label="Room for 5" value={top.answers.roomForFive.replace(/_/g, ' ')} />
                  <Field label="Water" value={formatEnumLabel(top.answers.water)} />
                  <Field
                    label="Nearby"
                    value={top.answers.nearby.filter((a) => a !== 'none').join(', ').replace(/_/g, ' ') || '—'}
                  />
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs">
                  <p className="font-medium uppercase tracking-wide text-slate-400">Submitter</p>
                  <p className="mt-1 text-slate-700">
                    {!top.submitterWasClaimed
                      ? top.source === 'site_finder'
                        ? "Found by AireStop's scan"
                        : 'Anonymous'
                      : !top.submitterEmail
                        ? 'Account deleted'
                        : top.submitterFirstName
                          ? `${top.submitterFirstName} · ${top.submitterEmail}`
                          : top.submitterEmail}
                  </p>
                  {otherSubmissions.length > 0 && (
                    <>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setOtherSitesOpenFor(showOtherSites ? null : top.id)}
                        className="mt-1 font-medium text-brand-700 underline"
                      >
                        {otherSubmissions.length} other {otherSubmissions.length === 1 ? 'site' : 'sites'} from this submitter
                      </button>
                      {showOtherSites && (
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {otherSubmissions.map((n) => (
                            <li key={n.id}>
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => navigate(`/admin/stop/${n.id}`)}
                                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-white"
                              >
                                <span className="capitalize text-slate-600">
                                  {formatEnumLabel(n.answers.placeType, 'Potential stop')}
                                </span>
                                <span className="font-medium text-brand-700">{STATUS_LABEL[n.status]}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-400">
                  <span>
                    {top.voteCount} {top.voteCount === 1 ? 'vote' : 'votes'} · {formatEnumLabel(top.payBand, 'no pay answer')}
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => navigate(`/admin/stop/${top.id}`)}
                    className="font-medium text-brand-700 underline"
                  >
                    Full details →
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-5">
            <button
              type="button"
              aria-label="Not suitable"
              onClick={() => void commit('not_suitable')}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl text-red-600 shadow-md active:scale-95"
            >
              ✕
            </button>
            <button
              type="button"
              aria-label="Under review"
              onClick={() => void commit('under_review')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-slate-500 shadow-md active:scale-95"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Shortlist"
              onClick={() => void commit('shortlist')}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl text-emerald-600 shadow-md active:scale-95"
            >
              ✓
            </button>
          </div>
        </>
      )}

      {lastAction && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center">
          <div className="flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
            <span>Marked {lastAction.label}</span>
            <button type="button" onClick={() => void handleUndo()} className="font-semibold text-brand-200 underline">
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="capitalize text-slate-700">{value}</p>
    </div>
  )
}
