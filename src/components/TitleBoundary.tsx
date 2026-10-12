import type { AdminNomination, TitleBoundaryCoverage } from '../types'

/**
 * "No known owner" badge — shown when supabase/migrations/0015_title_boundaries.sql's
 * bulk HMLR/Registers of Scotland lookup found no matching registered
 * title at this exact location. Framed as a positive, actionable signal
 * (emerald, not amber/red) per src/lib/priority.ts's NO_KNOWN_OWNER_BOOST:
 * no registered title here means no landowner to negotiate a lease with.
 * "No known owner" is deliberately not "unowned" — see that migration's
 * header comment on why ~10-14% of England & Wales land being unregistered
 * makes this a common, real signal rather than a rare edge case.
 */
export function NoKnownOwnerBadge({ nomination }: { nomination: AdminNomination }) {
  if (nomination.titleNumber != null) return null
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
 * just a label.
 */
export function NoKnownOwnerPanel({ nomination }: { nomination: AdminNomination }) {
  if (nomination.titleNumber == null) {
    return (
      <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-semibold">No known owner</p>
        <p className="mt-1 text-emerald-800">
          No registered title was found at this location in HM Land Registry's or Registers of
          Scotland's bulk title boundary data. That means the land is unregistered — common for
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

const NATION_LABEL: Record<TitleBoundaryCoverage['nation'], string> = {
  england_wales: 'England & Wales',
  scotland: 'Scotland',
}

/**
 * Dashboard-wide disclosure, not a per-nomination one: until the scheduled
 * sync scripts have actually run (see .github/workflows/sync-title-boundaries-*.yml),
 * public.title_boundaries is empty and every "no known owner" badge on the
 * page just means "nothing to check against yet", not a real non-match.
 * Renders nothing once both nations have at least some data loaded, so it
 * doesn't linger as permanent clutter once the sync is actually running.
 */
export function TitleCoverageNotice({ coverage }: { coverage: TitleBoundaryCoverage[] }) {
  const missing = (['england_wales', 'scotland'] as const).filter(
    (nation) => !coverage.some((c) => c.nation === nation && c.rowCount > 0),
  )
  if (missing.length === 0) return null
  return (
    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      Title boundary data for {missing.map((n) => NATION_LABEL[n]).join(' and ')} hasn't synced yet
      — "no known owner" badges for those areas just mean nothing's loaded to check against, not a
      confirmed non-match.
    </p>
  )
}
