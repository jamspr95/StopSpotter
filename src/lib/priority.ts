import type { AdminNomination } from '../types'

/**
 * "A combined priority score (stop fit + demand + ownership known) feeds
 * the sales pipeline" — docs/PROJECT_PLAN.md "Relationship to the site
 * finder" / docs/BUILD_PLAN.md engineering implications.
 *
 * criteria.score (human fit, roughly -2..+9 per docs/BUILD_PLAN.md's
 * scoring table) and siteFinderScore (SiteFinder's own 0-1 land-fit score)
 * measure different things on different scales and must never be averaged
 * directly into one stored column — see
 * supabase/migrations/0013_site_finder_integration.sql's comment on why
 * criteria_score itself is never derived from it. This is a separate,
 * admin-dashboard-only ranking value: it writes to no column, isn't
 * persisted anywhere, and is recomputed fresh every time a nomination list
 * is sorted — so the weights below can be retuned freely without a
 * migration, once real pipeline conversion data says they should be.
 *
 * Three components, equally-ish weighted to start (a deliberate initial
 * choice, not a tuned one):
 *  - stopFit (0-1, weight 0.4): criteria.score normalised to 0-1, blended
 *    with siteFinderScore when a row has both (source='both' — a human
 *    nominated the same spot SiteFinder's scan already found), otherwise
 *    whichever of the two the row actually has.
 *  - demand (0-1, weight 0.4): vote count, capped at 10 votes = max. A
 *    freshly-scanned site_finder candidate nobody's voted for yet scores 0
 *    here, same as a brand new user nomination — demand has to be earned
 *    by both equally, a scan alone isn't demand.
 *  - ownershipKnown (0-1, weight 0.2): SiteFinder's own ownershipConfidenceDetail
 *    when it's assessed one, else a proxy read off the human's own
 *    ownerType answer (knowing it's council/public land, or the nominator
 *    owns it outright, is itself a real ownership signal even without a
 *    SiteFinder scan).
 */
export function computePriorityScore(n: AdminNomination): number {
  return 0.4 * stopFit(n) + 0.4 * demand(n) + 0.2 * ownershipKnown(n)
}

function normalizedCriteriaScore(score: number): number {
  // Clamped — docs/BUILD_PLAN.md's scoring table runs roughly -2..+9, but
  // an unusual answer combination could fall outside that rough range
  // without this, which would push the blended result out of 0-1.
  return Math.min(1, Math.max(0, (score + 2) / 11))
}

function stopFit(n: AdminNomination): number {
  // A pure site_finder row's criteria.score is just the column default
  // (0), never a real human answer — excluded here for the same reason
  // the migration never writes one into it.
  const human = n.source !== 'site_finder' ? normalizedCriteriaScore(n.criteria.score) : null
  const scan = n.siteFinderScore
  if (human != null && scan != null) return (human + scan) / 2
  return human ?? scan ?? 0
}

function demand(n: AdminNomination): number {
  return Math.min(1, n.voteCount / 10)
}

const OWNERSHIP_CONFIDENCE_WEIGHT: Record<string, number> = {
  high: 1,
  medium: 0.6,
  low: 0.3,
  unknown: 0,
}

// A human's own ownerType answer, used only when SiteFinder hasn't assessed
// ownershipConfidenceDetail at all (a pure 'user' row).
const OWNER_TYPE_PROXY_WEIGHT: Record<string, number> = {
  i_own_it: 1,
  council: 0.8,
  public_body: 0.8,
  business: 0.5,
  private_individual: 0.5,
  dont_know: 0.2,
}

function ownershipKnown(n: AdminNomination): number {
  if (n.ownershipConfidenceDetail) return OWNERSHIP_CONFIDENCE_WEIGHT[n.ownershipConfidenceDetail] ?? 0
  return OWNER_TYPE_PROXY_WEIGHT[n.answers.ownerType] ?? 0.2
}
