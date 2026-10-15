import { useAdminStore } from '../store/useAdminStore'
import type { AdminNomination } from '../types'

/**
 * "No known owner" badge — shown once a title lookup has actually run
 * (supabase/functions/lookup-title-boundary, triggered by LookupTitleButton
 * below) and found no matching registered title at this exact location.
 * Framed as a positive, actionable signal (emerald, not amber/red) per
 * src/lib/priority.ts's NO_KNOWN_OWNER_BOOST: no registered title here
 * means no landowner to negotiate a lease with. "No known owner" is
 * deliberately not "unowned" — see docs/TITLE_BOUNDARY_API_PLAN.md and
 * 0017_title_lookup_columns.sql's header comment on why ~10-14% of
 * England & Wales land being unregistered makes this a common, real
 * signal rather than a rare edge case. Renders nothing until someone's
 * actually run the lookup — titleCheckedAt null means "not checked yet",
 * not "no known owner".
 */
export function NoKnownOwnerBadge({ nomination }: { nomination: AdminNomination }) {
  if (nomination.titleCheckedAt == null || nomination.titleNumber != null) return null
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      No known owner
    </span>
  )
}

/**
 * Longer-form explanation for the stop detail page — same signal as
 * NoKnownOwnerBadge, with the practical next-steps an admin actually needs
 * (not legal advice on claiming land, just where to look next) rather than
 * just a label. Shows the "look up title" prompt instead when nobody's
 * run the lookup yet.
 */
export function NoKnownOwnerPanel({ nomination }: { nomination: AdminNomination }) {
  if (nomination.titleCheckedAt == null) {
    return (
      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Title not looked up yet</p>
        <p className="mt-1">
          Run the lookup below to check HM Land Registry's or Registers of Scotland's title
          boundary data for this exact location.
        </p>
      </div>
    )
  }
  if (nomination.titleNumber == null) {
    return (
      <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-semibold">No known owner</p>
        <p className="mt-1 text-emerald-800">
          No registered title was found at this location in HM Land Registry's or Registers of
          Scotland's title boundary data. That means the land is unregistered — common for
          older rural land, not evidence it's unowned — so there's no landowner on record to
          negotiate a lease with. If this stop goes ahead, that's likely close to 100% margin.
          Next step: check with the local council or, in England & Wales, the Commons Registration
          Authority, rather than assuming it's free to use.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
      <p className="font-semibold text-slate-800">Registered title found</p>
      <p className="mt-1">
        Title {nomination.titleNumber}
        {nomination.titleTenure ? ` · ${nomination.titleTenure}` : ''} — an indicative extent only,
        not the legal boundary, and the registry doesn't carry an owner's name. Still means there's
        a specific title to trace an owner through, rather than starting from nothing.
      </p>
    </div>
  )
}

/**
 * Triggers the on-demand lookup (supabase/functions/lookup-title-boundary)
 * for one nomination and saves the result — see
 * docs/TITLE_BOUNDARY_API_PLAN.md. Deliberately a manual action, not
 * something that runs automatically for every nomination: StopSpotter's
 * nomination volume is low enough that an admin reviewing a stop is a
 * better trigger than checking every submission the moment it arrives.
 */
export function LookupTitleButton({ nomination }: { nomination: AdminNomination }) {
  const loadingId = useAdminStore((s) => s.titleLookupLoadingId)
  const lookupNominationTitle = useAdminStore((s) => s.lookupNominationTitle)
  // AdminStore's `error` is shared across every admin action, not scoped to
  // this lookup — real incident: this screen (AdminStopDetailScreen) never
  // read it at all, so a failed lookup set it, then silently went nowhere;
  // clicking the button looked like it did nothing. Only showing it while
  // nothing else is loading keeps it from flashing an unrelated action's
  // leftover error, though a stale one from another failed admin action
  // elsewhere on this page could still show here until the next action
  // clears it.
  const error = useAdminStore((s) => s.error)
  const loading = loadingId === nomination.id

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={() => void lookupNominationTitle(nomination.id)}
        className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {loading ? 'Looking up…' : nomination.titleCheckedAt == null ? 'Look up title' : 'Look up title again'}
      </button>
      {!loading && error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
