import type { User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type {
  AdminLandownerLead,
  AdminModerationReport,
  AdminNomination,
  AdminStatusHistoryEntry,
  ConsentRecord,
  HowKnown,
  LatLng,
  LandownerFollowUp,
  Nomination,
  NominationAnswers,
  NominationStatus,
  PayBand,
  Vote,
} from '../types'

function client() {
  if (!supabase) throw new Error('Supabase is not configured — check isSupabaseConfigured first.')
  return supabase
}

function toWKT(point: LatLng): string {
  return `SRID=4326;POINT(${point.lng} ${point.lat})`
}

const PLACEHOLDER_COUNCIL_AREA =
  'Council area — to be confirmed (needs ONS boundary data, Milestone 2)'

// ── Auth ─────────────────────────────────────────────────────────────────
// The real magic-link flow (replacing Milestone 1's "simulate" button):
// sendMagicLink() only calls Supabase, it writes nothing — there's no
// session yet to attach a nomination/vote/consent to. The draft stays in
// the Zustand store (already localStorage-persisted) until the user clicks
// the link and is redirected back with a session, at which point
// onAuthStateChange below fires and the store's init logic finalizes
// whatever was pending. See docs/SETUP.md for the auth redirect URL that
// must be allow-listed in the Supabase dashboard.

export async function sendMagicLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}spot/signup`
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw error
}

export type SSOProvider = 'google' | 'apple' | 'facebook'

/**
 * Same "nothing is written until the redirect comes back with a session"
 * shape as sendMagicLink, but the browser leaves the page immediately
 * (full navigation to the provider's consent screen) rather than waiting
 * for an email click — supabase-js's signInWithOAuth does that navigation
 * itself, so there's nothing meaningful to await after it resolves.
 * Provider setup (OAuth app + redirect URI on each provider's own
 * developer console, then the client ID/secret into the Supabase
 * dashboard) is external — see docs/SETUP.md.
 */
export async function signInWithOAuth(provider: SSOProvider): Promise<void> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}spot/signup`
  const { error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  })
  if (error) throw error
}

export async function getCurrentSessionUser(): Promise<User | null> {
  const {
    data: { session },
  } = await client().auth.getSession()
  return session?.user ?? null
}

/** Fires on sign-in, sign-out and token refresh. Returns an unsubscribe function. */
export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const {
    data: { subscription },
  } = client().auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => subscription.unsubscribe()
}

export async function upsertProfile(
  userId: string,
  firstName: string | undefined,
  source: string,
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .upsert({ id: userId, first_name: firstName ?? null, source })
  if (error) throw error
}

export async function insertConsents(userId: string, consents: ConsentRecord[]): Promise<void> {
  const { error } = await client()
    .from('consents')
    .insert(
      consents.map((c) => ({
        user_id: userId,
        purpose: c.purpose,
        granted: c.granted,
        wording_version: c.wordingVersion,
      })),
    )
  if (error) throw error
}

// ── Nominations: public read ────────────────────────────────────────────
// Reads go through the public_nominations VIEW, not the base table — it's
// the only thing anon/authenticated have a column grant on that includes
// usable coordinates (public_location as a geography column comes back as
// raw WKB hex, not something to parse in the browser). See
// supabase/migrations/0001_init.sql.

interface PublicNominationRow {
  id: string
  public_lat: number
  public_lng: number
  council_area: string | null
  place_type: NominationAnswers['placeType']
  nearby: NominationAnswers['nearby']
  why_here: string | null
  pay_band: PayBand
  status: NominationStatus
  verified: boolean
  created_at: string
}

// Fields the public view doesn't expose (owner_type, criteria, exact
// location, user_id) get neutral placeholders here rather than being
// optional on Nomination — nothing in the UI reads them for a nomination
// that isn't the current user's own (confirmed: StopCardScreen, MapScreen
// and MyStopsScreen only ever read placeType/councilArea/whyHere/nearby/
// payBand/status/verified/id off a list entry). The signed-in user's own
// full data comes from fetchMyNominations() below instead, via a
// SECURITY DEFINER RPC that isn't subject to this column restriction.
function publicRowToNomination(row: PublicNominationRow): Nomination {
  const point = { lat: row.public_lat, lng: row.public_lng }
  return {
    id: row.id,
    userId: null,
    exact: point,
    public: point,
    councilArea: row.council_area ?? PLACEHOLDER_COUNCIL_AREA,
    answers: {
      placeType: row.place_type,
      ownerType: 'dont_know',
      nearestHouse: 'not_sure',
      slope: 'flat',
      roomForFive: 'yes',
      nearby: row.nearby,
      water: 'dont_know',
    },
    whyHere: row.why_here ?? undefined,
    payBand: row.pay_band,
    criteria: { score: 0, flags: [] },
    ownershipHint: '',
    status: row.status,
    verified: row.verified,
    source: 'user',
    createdAt: row.created_at,
  }
}

export async function fetchPublicNominations(): Promise<Nomination[]> {
  const { data, error } = await client()
    .from('public_nominations')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as PublicNominationRow[]).map(publicRowToNomination)
}

interface PublicVoteRow {
  id: string
  nomination_id: string
  pay_band: PayBand
  verified: boolean
  created_at: string
}

// user_id isn't in the public column grant either (it'd deanonymise who
// voted for what) — '' stands in for "not visible", same reasoning as
// publicRowToNomination above.
export async function fetchPublicVotes(): Promise<Vote[]> {
  const { data, error } = await client()
    .from('votes')
    .select('id, nomination_id, pay_band, verified, created_at')
  if (error) throw error
  return (data as PublicVoteRow[]).map((row) => ({
    id: row.id,
    userId: '',
    nominationId: row.nomination_id,
    payBand: row.pay_band,
    verified: row.verified,
    createdAt: row.created_at,
  }))
}

// ── Nominations: writing ────────────────────────────────────────────────

export interface NominationInsert {
  userId: string | null
  exact: LatLng
  public: LatLng
  councilArea: string
  answers: NominationAnswers
  whyHere?: string
  payBand: PayBand
  criteriaScore: number
  criteriaFlags: string[]
  ownershipHint: string
  landowner?: LandownerFollowUp
}

export async function insertNomination(input: NominationInsert): Promise<string> {
  const { data, error } = await client()
    .from('nominations')
    .insert({
      user_id: input.userId,
      exact_location: toWKT(input.exact),
      public_location: toWKT(input.public),
      council_area: input.councilArea,
      place_type: input.answers.placeType,
      owner_type: input.answers.ownerType,
      nearest_house: input.answers.nearestHouse,
      slope: input.answers.slope,
      room_for_five: input.answers.roomForFive,
      nearby: input.answers.nearby,
      water: input.answers.water,
      why_here: input.whyHere ?? null,
      pay_band: input.payBand,
      criteria_score: input.criteriaScore,
      criteria_flags: input.criteriaFlags,
      ownership_hint: input.ownershipHint,
    })
    .select('id')
    .single()
  if (error) throw error
  const nominationId = (data as { id: string }).id

  if (input.landowner && hasLandownerDetail(input.landowner)) {
    await insertLandownerLead(nominationId, input.landowner)
  }

  return nominationId
}

function hasLandownerDetail(lo: LandownerFollowUp): boolean {
  return Boolean(lo.ownerNameOrOrg || lo.howKnown || lo.contact)
}

/**
 * Standalone from insertNomination's own landowner write because a voter
 * can also supply landowner detail when a stop's owner isn't yet known
 * (docs/BUILD_PLAN.md) — there's no UPDATE policy on nominations
 * (admin/pipeline-only, by design), so that becomes an additional
 * landowner_leads row rather than editing the original nomination.
 */
export async function insertLandownerLead(
  nominationId: string,
  lo: LandownerFollowUp,
): Promise<void> {
  const { error } = await client()
    .from('landowner_leads')
    .insert({
      nomination_id: nominationId,
      owner_name_or_org: lo.ownerNameOrOrg ?? null,
      how_known: lo.howKnown ?? null,
      contact: lo.contact ?? null,
      happy_to_be_contacted: lo.happyToBeContacted ?? null,
    })
  if (error) throw error
}

export async function insertVote(input: {
  userId: string
  nominationId: string
  payBand: PayBand
}): Promise<string> {
  const { data, error } = await client()
    .from('votes')
    .insert({ user_id: input.userId, nomination_id: input.nominationId, pay_band: input.payBand })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

// ── "My Stops" — the signed-in user's own full data ─────────────────────
// Via SECURITY DEFINER RPCs (get_my_nominations / get_my_votes), not the
// public view/column grants — see the migration for why a plain grant
// can't do "this column, but only on rows you own".

interface MyNominationRow {
  id: string
  exact_lat: number
  exact_lng: number
  public_lat: number
  public_lng: number
  council_area: string | null
  place_type: NominationAnswers['placeType']
  owner_type: NominationAnswers['ownerType']
  nearest_house: NominationAnswers['nearestHouse']
  slope: NominationAnswers['slope']
  room_for_five: NominationAnswers['roomForFive']
  nearby: NominationAnswers['nearby']
  water: NominationAnswers['water']
  why_here: string | null
  pay_band: PayBand
  criteria_score: number
  criteria_flags: string[]
  ownership_hint: string | null
  status: NominationStatus
  verified: boolean
  created_at: string
}

export async function fetchMyNominations(userId: string): Promise<Nomination[]> {
  const { data, error } = await client().rpc('get_my_nominations')
  if (error) throw error
  return (data as MyNominationRow[]).map((row) => ({
    id: row.id,
    userId,
    exact: { lat: row.exact_lat, lng: row.exact_lng },
    public: { lat: row.public_lat, lng: row.public_lng },
    councilArea: row.council_area ?? PLACEHOLDER_COUNCIL_AREA,
    answers: {
      placeType: row.place_type,
      ownerType: row.owner_type,
      nearestHouse: row.nearest_house,
      slope: row.slope,
      roomForFive: row.room_for_five,
      nearby: row.nearby,
      water: row.water,
    },
    whyHere: row.why_here ?? undefined,
    payBand: row.pay_band,
    criteria: { score: row.criteria_score, flags: row.criteria_flags },
    ownershipHint: row.ownership_hint ?? '',
    status: row.status,
    verified: row.verified,
    source: 'user',
    createdAt: row.created_at,
  }))
}

interface MyVoteRow {
  id: string
  nomination_id: string
  pay_band: PayBand
  verified: boolean
  created_at: string
}

export async function fetchMyVotes(userId: string): Promise<Vote[]> {
  const { data, error } = await client().rpc('get_my_votes')
  if (error) throw error
  return (data as MyVoteRow[]).map((row) => ({
    id: row.id,
    userId,
    nominationId: row.nomination_id,
    payBand: row.pay_band,
    verified: row.verified,
    createdAt: row.created_at,
  }))
}

// ── Other RPCs ───────────────────────────────────────────────────────────

/**
 * Server-side 200m duplicate-pin check — exact_location isn't readable by
 * anon/authenticated directly (see the migration), so this RPC is the only
 * way to run it against the real backend.
 */
export async function findNearbyNomination(
  point: LatLng,
): Promise<{ id: string; placeType: string; status: string } | null> {
  const { data, error } = await client().rpc('find_nearby_nomination', {
    pt: toWKT(point),
    radius_m: 200,
  })
  if (error) throw error
  const rows = data as Array<{ id: string; place_type: string; status: string }>
  const row = rows[0]
  return row ? { id: row.id, placeType: row.place_type, status: row.status } : null
}

/** Null until council_boundaries is loaded — see docs/SETUP.md. */
export async function councilAreaForPoint(point: LatLng): Promise<string | null> {
  const { data, error } = await client().rpc('council_area_for_point', { pt: toWKT(point) })
  if (error) throw error
  return (data as string | null) ?? null
}

export async function insertModerationReport(nominationId: string, reason: string): Promise<void> {
  const { error } = await client()
    .from('moderation_reports')
    .insert({ nomination_id: nominationId, reason })
  if (error) throw error
}

// ── Admin (Milestone 3) ──────────────────────────────────────────────────
// Everything below only works for a signed-in user present in the
// `admins` table (supabase/migrations/0002_admin.sql) — every RPC checks
// that server-side and raises 'not authorized' otherwise. There's no
// separate "admin password" scheme: an admin account is a normal Supabase
// Auth user (created via the dashboard, see docs/SETUP.md) that signs in
// with email + password rather than the public app's magic link, then
// gets added to `admins` once, manually.

export async function adminSignIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function adminSignOut(): Promise<void> {
  const { error } = await client().auth.signOut()
  if (error) throw error
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await client().rpc('current_user_is_admin')
  if (error) throw error
  return Boolean(data)
}

interface AdminNominationRow {
  id: string
  user_id: string | null
  exact_lat: number
  exact_lng: number
  public_lat: number
  public_lng: number
  council_area: string | null
  place_type: NominationAnswers['placeType']
  owner_type: NominationAnswers['ownerType']
  nearest_house: NominationAnswers['nearestHouse']
  slope: NominationAnswers['slope']
  room_for_five: NominationAnswers['roomForFive']
  nearby: NominationAnswers['nearby']
  water: NominationAnswers['water']
  why_here: string | null
  pay_band: PayBand
  criteria_score: number
  criteria_flags: string[]
  ownership_hint: string | null
  status: NominationStatus
  verified: boolean
  source: 'user' | 'site_finder' | 'both'
  created_at: string
  vote_count: number
}

export async function adminListNominations(): Promise<AdminNomination[]> {
  const { data, error } = await client().rpc('admin_list_nominations')
  if (error) throw error
  return (data as AdminNominationRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    exact: { lat: row.exact_lat, lng: row.exact_lng },
    public: { lat: row.public_lat, lng: row.public_lng },
    councilArea: row.council_area,
    answers: {
      placeType: row.place_type,
      ownerType: row.owner_type,
      nearestHouse: row.nearest_house,
      slope: row.slope,
      roomForFive: row.room_for_five,
      nearby: row.nearby,
      water: row.water,
    },
    whyHere: row.why_here ?? undefined,
    payBand: row.pay_band,
    criteria: { score: row.criteria_score, flags: row.criteria_flags },
    ownershipHint: row.ownership_hint ?? '',
    status: row.status,
    verified: row.verified,
    source: row.source,
    createdAt: row.created_at,
    voteCount: row.vote_count,
  }))
}

export async function adminUpdateNominationStatus(
  nominationId: string,
  newStatus: NominationStatus,
  note?: string,
): Promise<void> {
  const { error } = await client().rpc('admin_update_nomination_status', {
    p_nomination_id: nominationId,
    p_new_status: newStatus,
    p_note: note ?? null,
  })
  if (error) throw error
}

interface AdminStatusHistoryRow {
  id: string
  from_status: NominationStatus | null
  to_status: NominationStatus
  changed_by: string | null
  note: string | null
  created_at: string
}

export async function adminListStatusHistory(nominationId: string): Promise<AdminStatusHistoryEntry[]> {
  const { data, error } = await client().rpc('admin_list_status_history', {
    p_nomination_id: nominationId,
  })
  if (error) throw error
  return (data as AdminStatusHistoryRow[]).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    note: row.note,
    createdAt: row.created_at,
  }))
}

interface AdminLandownerLeadRow {
  id: string
  owner_name_or_org: string | null
  how_known: HowKnown | null
  contact: string | null
  happy_to_be_contacted: boolean | null
  created_at: string
}

export async function adminListLandownerLeads(nominationId: string): Promise<AdminLandownerLead[]> {
  const { data, error } = await client().rpc('admin_list_landowner_leads', {
    p_nomination_id: nominationId,
  })
  if (error) throw error
  return (data as AdminLandownerLeadRow[]).map((row) => ({
    id: row.id,
    ownerNameOrOrg: row.owner_name_or_org ?? undefined,
    howKnown: row.how_known ?? undefined,
    contact: row.contact ?? undefined,
    happyToBeContacted: row.happy_to_be_contacted ?? undefined,
    createdAt: row.created_at,
  }))
}

interface AdminModerationReportRow {
  id: string
  nomination_id: string
  reporter_id: string | null
  reason: string
  resolved: boolean
  created_at: string
  nomination_place_type: string
  nomination_council_area: string | null
  nomination_why_here: string | null
  nomination_status: NominationStatus
}

export async function adminListModerationReports(
  includeResolved = false,
): Promise<AdminModerationReport[]> {
  const { data, error } = await client().rpc('admin_list_moderation_reports', {
    p_include_resolved: includeResolved,
  })
  if (error) throw error
  return (data as AdminModerationReportRow[]).map((row) => ({
    id: row.id,
    nominationId: row.nomination_id,
    reporterId: row.reporter_id,
    reason: row.reason,
    resolved: row.resolved,
    createdAt: row.created_at,
    nominationPlaceType: row.nomination_place_type,
    nominationCouncilArea: row.nomination_council_area,
    nominationWhyHere: row.nomination_why_here,
    nominationStatus: row.nomination_status,
  }))
}

export async function adminResolveModerationReport(reportId: string): Promise<void> {
  const { error } = await client().rpc('admin_resolve_moderation_report', {
    p_report_id: reportId,
  })
  if (error) throw error
}
