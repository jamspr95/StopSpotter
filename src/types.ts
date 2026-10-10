export type OwnerType =
  | 'council'
  | 'public_body'
  | 'business'
  | 'private_individual'
  | 'i_own_it'
  | 'dont_know'

export type HowKnown = 'i_own_it' | 'i_know_them' | 'public_information' | 'dont_know'

export type PayBand = 'free_only' | 'up_to_10' | '10_15' | '15_20' | '20_plus'

export type NominationStatus =
  | 'submitted'
  | 'under_review'
  | 'shortlisted'
  | 'live'
  | 'not_suitable'

export interface LatLng {
  lat: number
  lng: number
}

/**
 * Answers 1-7 captured on the nomination form; question 8 is demand, stored
 * separately. placeType/nearestHouse/slope/water are nullable because a
 * source='site_finder' nomination (supabase/migrations/0013_site_finder_integration.sql)
 * has no honest answer to any of them — SiteFinder's pipeline never asks
 * "would you stay here?" or measures distance to the nearest house as a
 * category. A source='user' row always has every one of these filled in
 * (enforced by that migration's check constraint), so this is only ever
 * null on a nomination StopSpotter itself didn't collect.
 */
export interface NominationAnswers {
  placeType: 'unused_land' | 'grass_field' | 'lay_by' | 'car_park' | 'other' | null
  ownerType: OwnerType
  nearestHouse: 'under_20m' | '20_50m' | 'over_50m' | 'not_sure' | null
  slope: 'flat' | 'gentle_slope' | 'steep' | null
  roomForFive: 'yes' | 'not_sure' | 'no'
  nearby: Array<'pub' | 'shop' | 'town_centre' | 'attraction' | 'beach_or_trail' | 'none'>
  water: 'toilet_block' | 'water_tap' | 'both' | 'dont_know' | null
}

export interface LandownerFollowUp {
  ownerNameOrOrg?: string
  howKnown?: HowKnown
  contact?: string
  happyToBeContacted?: boolean
}

export interface CriteriaResult {
  score: number
  flags: string[]
}

export interface Nomination {
  id: string
  userId: string | null
  exact: LatLng
  public: LatLng
  councilArea: string
  /** Friendly "near <town/village>" label for the public card — see src/lib/geocode.ts. Null if the reverse-geocode lookup failed or hasn't run (older rows). */
  areaLabel: string | null
  answers: NominationAnswers
  whyHere?: string
  /** Null for a source='site_finder' row — no willingness-to-pay signal exists without a human nominator. */
  payBand: PayBand | null
  criteria: CriteriaResult
  ownershipHint: string
  landowner?: LandownerFollowUp
  status: NominationStatus
  verified: boolean
  source: 'user' | 'site_finder' | 'both'
  createdAt: string
}

export interface Vote {
  id: string
  userId: string
  nominationId: string
  payBand: PayBand
  verified: boolean
  createdAt: string
}

export interface ConsentRecord {
  purpose: 'news' | 'support'
  granted: boolean
  wordingVersion: string
  timestamp: string
}

export interface CurrentUser {
  id: string
  email: string | null
  firstName?: string
  verified: boolean
  consents: ConsentRecord[]
}

// ── Admin (Milestone 3) ───────────────────────────────────────────────────
// Full-detail shapes the admin dashboard reads via the admin_* RPCs in
// supabase/migrations/0002_admin.sql — includes columns (exact location,
// owner_type, criteria_score/flags, user_id) the public app never sees.

export interface AdminNomination {
  id: string
  userId: string | null
  exact: LatLng
  public: LatLng
  councilArea: string | null
  areaLabel: string | null
  answers: NominationAnswers
  whyHere?: string
  payBand: PayBand | null
  criteria: CriteriaResult
  ownershipHint: string
  status: NominationStatus
  verified: boolean
  source: 'user' | 'site_finder' | 'both'
  createdAt: string
  voteCount: number
  /** Live email/first name off the submitter's account, null once it's never been claimed or the account's gone. */
  submitterEmail: string | null
  submitterFirstName: string | null
  /** True once this nomination was ever attached to a signed-in user — distinguishes "never had one" (false) from "had one, account since deleted" (true, submitterEmail null). */
  submitterWasClaimed: boolean
  // ── SiteFinder detail (supabase/migrations/0013_site_finder_integration.sql) ──
  // Admin-only, same as exact location/owner_type above — withheld from
  // anon/authenticated by the same column-grant pattern in that migration.
  // Null on a pure source='user' row; populated (to whatever extent
  // SiteFinder's own pipeline run produced) on 'site_finder' or 'both'.
  /** SiteFinder's own 0-1 score (config/scoring.yaml in the SiteFinder repo) — NOT comparable to criteria.score, see src/lib/priority.ts for how the two get combined. */
  siteFinderScore: number | null
  siteFinderComponentScores: Record<string, number> | null
  siteFinderFlags: string[]
  usableAreaM2: number | null
  capacityPitches: number | null
  avgSlopePercent: number | null
  slopeSource: string | null
  roadAccess: 'good' | 'fair' | 'poor' | 'unknown' | null
  ownershipConfidenceDetail: 'high' | 'medium' | 'low' | 'unknown' | null
  coastDistanceM: number | null
}

export interface AdminLandownerLead {
  id: string
  ownerNameOrOrg?: string
  howKnown?: HowKnown
  contact?: string
  happyToBeContacted?: boolean
  createdAt: string
}

export interface AdminStatusHistoryEntry {
  id: string
  fromStatus: NominationStatus | null
  toStatus: NominationStatus
  changedBy: string | null
  note: string | null
  createdAt: string
}

export interface AdminAnalyticsSummaryRow {
  eventType: string
  campaign: string | null
  eventCount: number
}

export interface AdminGrowthFeedback {
  id: string
  options: string[]
  message: string | null
  email: string | null
  actioned: boolean
  crmSynced: boolean
  createdAt: string
}

export interface AdminModerationReport {
  id: string
  nominationId: string
  reporterId: string | null
  reason: string
  resolved: boolean
  createdAt: string
  nominationPlaceType: string | null
  nominationCouncilArea: string | null
  nominationWhyHere: string | null
  nominationStatus: NominationStatus
}
