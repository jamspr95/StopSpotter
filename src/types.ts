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

/** Answers 1-7 captured on the nomination form; question 8 is demand, stored separately. */
export interface NominationAnswers {
  placeType: 'unused_land' | 'grass_field' | 'lay_by' | 'car_park' | 'other'
  ownerType: OwnerType
  nearestHouse: 'under_20m' | '20_50m' | 'over_50m' | 'not_sure'
  slope: 'flat' | 'gentle_slope' | 'steep'
  roomForFive: 'yes' | 'not_sure' | 'no'
  nearby: Array<'pub' | 'shop' | 'town_centre' | 'attraction' | 'beach_or_trail' | 'none'>
  water: 'toilet_block' | 'water_tap' | 'both' | 'dont_know'
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
  answers: NominationAnswers
  whyHere?: string
  payBand: PayBand
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
  answers: NominationAnswers
  whyHere?: string
  payBand: PayBand
  criteria: CriteriaResult
  ownershipHint: string
  status: NominationStatus
  verified: boolean
  source: 'user' | 'site_finder' | 'both'
  createdAt: string
  voteCount: number
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

export interface AdminModerationReport {
  id: string
  nominationId: string
  reporterId: string | null
  reason: string
  resolved: boolean
  createdAt: string
  nominationPlaceType: string
  nominationCouncilArea: string | null
  nominationWhyHere: string | null
  nominationStatus: NominationStatus
}
