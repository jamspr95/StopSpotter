import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as db from '../lib/db'
import { guessCouncilArea, snapToPublicGrid } from '../lib/geo'
import { scoreNomination } from '../lib/scoring'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { seedNominations, seedVotes } from '../data/seed'
import type {
  ConsentRecord,
  CurrentUser,
  HowKnown,
  LatLng,
  Nomination,
  NominationAnswers,
  OwnerType,
  PayBand,
  Vote,
} from '../types'

/**
 * Real-backend mode: asks the council_area_for_point RPC (Milestone 2's
 * ONS-boundary lookup). Falls back to the same placeholder label as
 * local-only mode when boundaries haven't been loaded yet (the RPC
 * returns null) or the call fails — a lookup failure shouldn't block a
 * nomination from saving.
 */
async function resolveCouncilArea(point: LatLng): Promise<string> {
  if (!isSupabaseConfigured) return guessCouncilArea(point)
  try {
    return (await db.councilAreaForPoint(point)) ?? guessCouncilArea(point)
  } catch {
    return guessCouncilArea(point)
  }
}

/** Bump this if the consent wording below changes — recorded on every consent so the list stays defensible later. */
const CONSENT_WORDING_VERSION = '2026-10-v1'

export interface DraftNomination {
  pin: LatLng
  answers: Partial<NominationAnswers>
  whyHere?: string
  landowner?: {
    ownerNameOrOrg?: string
    howKnown?: HowKnown
    contact?: string
    happyToBeContacted?: boolean
  }
  payBand?: PayBand
  /** Id of the row ensureNominationSaved already wrote this draft as — see its doc comment. */
  savedId?: string
}

interface DraftVote {
  nominationId: string
  /** Only asked when the stop's owner isn't yet known — see docs/BUILD_PLAN.md. */
  ownerType?: OwnerType
  landowner?: DraftNomination['landowner']
  payBand?: PayBand
}

/** Support page's quick "help us grow" options/free-text — see 0006/0007_growth_feedback*.sql. */
interface DraftGrowthFeedback {
  options: string[]
  message?: string
}

type PendingFlow =
  | { type: 'nomination'; draft: DraftNomination }
  | { type: 'vote'; draft: DraftVote }
  | { type: 'growth_feedback'; draft: DraftGrowthFeedback }
  | null

interface Identity {
  email: string | null
  firstName?: string
  news: boolean
  support: boolean
}

interface AppState {
  hasSeenIntro: boolean
  nominations: Nomination[]
  votes: Vote[]
  currentUser: CurrentUser | null
  pendingFlow: PendingFlow
  /**
   * Local-only mode: email/name/consent choices captured at "Send my link",
   * held only long enough to build the simulated verification step.
   * Real-backend mode: the SAME data, but held because nothing can be
   * written yet — there's no session until the magic link is clicked and
   * the browser redirects back (losing all in-memory state). It survives
   * that via this store's own localStorage persistence; completePendingSignIn
   * reads it back once a session exists.
   */
  pendingIdentity: Identity | null
  /** Id of the nomination/vote/growth-feedback note just created, awaiting the simulated magic-link click (local-only mode only). */
  awaitingVerificationId: string | null
  awaitingVerificationKind: 'nomination' | 'vote' | 'growth_feedback' | null
  /**
   * Real-backend mode only: which auth flow is in flight, until
   * completePendingSignIn() runs and clears it back to null.
   * 'magic_link' drives the "check your email" interim screen; 'oauth'
   * doesn't need one (the browser already left the page for the
   * provider's consent screen) but still needs a signal so the screen
   * that remounts after the redirect knows a sign-in was in progress and
   * should navigate to /done once it completes.
   */
  authMethod: 'magic_link' | 'oauth' | null
  /** True once initRealBackend()'s first fetch has resolved — screens can use this to show a loading state instead of an empty map. */
  backendReady: boolean

  markIntroSeen: () => void
  beginNomination: (pin: LatLng) => void
  updateNominationDraft: (patch: Partial<DraftNomination>) => void
  /** Writes the nomination draft immediately, before SignUpScreen asks for an email — see ensureNominationSaved. */
  saveNominationDraft: () => Promise<void>
  beginVote: (nominationId: string) => void
  updateVoteDraft: (patch: Partial<DraftVote>) => void
  /** Support page quick options: starts the same email-capture flow nomination/vote use, so there's someone to follow up with. */
  beginGrowthFeedback: (options: string[], message?: string) => void
  cancelPendingFlow: () => void
  /**
   * Starts the email-capture step for whatever's pending. Nominations are
   * already saved by this point (see saveNominationDraft) — this just
   * requests the magic link (real-backend mode) or records the local
   * identity and waits for confirmMagicLink (local-only mode); votes and
   * growth feedback were never written before this point and still aren't,
   * until the email is confirmed.
   */
  finalizePendingFlow: (identity: Identity) => Promise<void>
  /** Local-only mode's simulated magic-link click. */
  confirmMagicLink: () => void
  /**
   * Real-backend mode only — there's no local-only equivalent (SSO
   * inherently needs a real provider + backend), so SignUpScreen simply
   * doesn't render these buttons when isSupabaseConfigured is false.
   * Consent choices are captured now (before the browser navigates away)
   * since pendingIdentity is all completePendingSignIn will have to work
   * with on return — the email itself comes from the provider via the
   * resulting session instead of from here.
   */
  signInWithSSO: (
    provider: db.SSOProvider,
    consent: { firstName?: string; news: boolean; support: boolean },
  ) => Promise<void>
  /** Real-backend mode only: fetches the live nominations/votes feed and wires up auth. Call once at startup. */
  initRealBackend: () => Promise<void>
}

function buildConsents(identity: Identity): ConsentRecord[] {
  const now = new Date().toISOString()
  return [
    { purpose: 'news', granted: identity.news, wordingVersion: CONSENT_WORDING_VERSION, timestamp: now },
    { purpose: 'support', granted: identity.support, wordingVersion: CONSENT_WORDING_VERSION, timestamp: now },
  ]
}

/**
 * Builds the Nomination the local store has always produced from a draft —
 * shared by local-only and the real backend's optimistic-append.
 * councilArea is a parameter rather than resolved internally so the
 * optimistic client-side object and the row actually written to the DB
 * (see resolveCouncilArea's callers) agree with each other.
 */
function nominationFromDraft(
  id: string,
  userId: string | null,
  draft: DraftNomination,
  verified: boolean,
  councilArea: string,
): Nomination {
  const answers = draft.answers as NominationAnswers
  return {
    id,
    userId,
    exact: draft.pin,
    public: snapToPublicGrid(draft.pin),
    councilArea,
    answers,
    whyHere: draft.whyHere,
    payBand: draft.payBand ?? 'free_only',
    criteria: scoreNomination(answers),
    ownershipHint:
      answers.ownerType === 'i_own_it'
        ? 'Nominator says they own this stop'
        : 'No ownership hint yet (site finder check runs in Milestone 2)',
    landowner: draft.landowner,
    status: 'submitted',
    verified,
    source: 'user',
    createdAt: new Date().toISOString(),
  }
}

type NominationFlow = Extract<PendingFlow, { type: 'nomination' }>

/**
 * Writes the nomination this draft hasn't been saved as yet (anonymous,
 * unverified) and returns its id — idempotent, since it just returns
 * draft.savedId once that's set. Called the moment NominationFormScreen's
 * question flow finishes, before SignUpScreen ever asks for an email, so a
 * nomination is never lost to someone abandoning at that step; also called
 * (as a fallback) from completePendingSignIn, in case that first save
 * never happened. Supabase mode writes the real row; local-only mode
 * appends to the in-memory list — either way the (unverified) Nomination
 * goes into state immediately, same as the old "submit without email" path
 * did, just unconditionally now rather than behind that button.
 */
async function ensureNominationSaved(
  flow: NominationFlow,
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): Promise<string> {
  if (flow.draft.savedId) return flow.draft.savedId
  const draft = flow.draft

  let id: string
  let councilArea: string
  if (isSupabaseConfigured) {
    councilArea = await resolveCouncilArea(draft.pin)
    id = await db.insertNomination({
      userId: null,
      exact: draft.pin,
      public: snapToPublicGrid(draft.pin),
      councilArea,
      answers: draft.answers as NominationAnswers,
      whyHere: draft.whyHere,
      payBand: draft.payBand ?? 'free_only',
      criteriaScore: scoreNomination(draft.answers as NominationAnswers).score,
      criteriaFlags: scoreNomination(draft.answers as NominationAnswers).flags,
      ownershipHint:
        draft.answers.ownerType === 'i_own_it'
          ? 'Nominator says they own this stop'
          : 'No ownership hint yet (site finder check runs in Milestone 2)',
      landowner: draft.landowner,
    })
  } else {
    councilArea = guessCouncilArea(draft.pin)
    id = `nom-${crypto.randomUUID()}`
  }

  const nomination = nominationFromDraft(id, null, draft, false, councilArea)
  const currentFlow = get().pendingFlow
  set({
    nominations: [...get().nominations, nomination],
    pendingFlow:
      currentFlow?.type === 'nomination'
        ? { type: 'nomination', draft: { ...currentFlow.draft, savedId: id } }
        : currentFlow,
  })
  return id
}

/** Real-backend mode: writes whatever's in pendingFlow/pendingIdentity now that a session exists. Called from initRealBackend's auth listener. */
async function completePendingSignIn(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  userId: string,
  email: string,
) {
  const { pendingFlow, pendingIdentity } = get()
  if (!pendingFlow || !pendingIdentity) return

  await db.upsertProfile(userId, pendingIdentity.firstName, 'facebook')
  const consents = buildConsents(pendingIdentity)
  await db.insertConsents(userId, consents)

  if (pendingFlow.type === 'nomination') {
    // Normally already saved (anonymous) by ensureNominationSaved before
    // this screen was ever reached — this call is then a no-op that just
    // returns that id. The insert only actually happens here as a
    // fallback, if that first save never completed.
    const savedId = await ensureNominationSaved(pendingFlow, get, set)
    await db.claimNomination(savedId)
    set({
      nominations: get().nominations.map((n) =>
        n.id === savedId ? { ...n, userId, verified: true } : n,
      ),
    })
  } else if (pendingFlow.type === 'vote') {
    const draft = pendingFlow.draft
    const voteId = await db.insertVote({
      userId,
      nominationId: draft.nominationId,
      payBand: draft.payBand ?? 'free_only',
    })
    const vote: Vote = {
      id: voteId,
      userId,
      nominationId: draft.nominationId,
      payBand: draft.payBand ?? 'free_only',
      verified: true,
      createdAt: new Date().toISOString(),
    }
    set({ votes: [...get().votes, vote] })

    // There's no UPDATE policy on nominations (admin/pipeline-only, by
    // design — see the migration) so a voter's answer about an unknown
    // owner becomes its own landowner_leads row rather than editing the
    // nomination in place. Multiple leads per nomination is fine; admins
    // see them all.
    if (draft.landowner) {
      await db.insertLandownerLead(draft.nominationId, draft.landowner)
    }
  } else {
    const draft = pendingFlow.draft
    await db.insertGrowthFeedback(draft.options, draft.message ?? null, email)
  }

  set({
    currentUser: { id: userId, email, firstName: pendingIdentity.firstName, verified: true, consents },
    pendingFlow: null,
    pendingIdentity: null,
    authMethod: null,
  })
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasSeenIntro: false,
      nominations: isSupabaseConfigured ? [] : seedNominations,
      votes: isSupabaseConfigured ? [] : seedVotes,
      currentUser: null,
      pendingFlow: null,
      pendingIdentity: null,
      awaitingVerificationId: null,
      awaitingVerificationKind: null,
      authMethod: null,
      backendReady: !isSupabaseConfigured,

      markIntroSeen: () => set({ hasSeenIntro: true }),

      beginNomination: (pin) =>
        set({ pendingFlow: { type: 'nomination', draft: { pin, answers: {} } } }),

      updateNominationDraft: (patch) =>
        set((state) => {
          if (state.pendingFlow?.type !== 'nomination') return state
          return {
            pendingFlow: {
              type: 'nomination',
              draft: { ...state.pendingFlow.draft, ...patch },
            },
          }
        }),

      beginVote: (nominationId) =>
        set({ pendingFlow: { type: 'vote', draft: { nominationId } } }),

      updateVoteDraft: (patch) =>
        set((state) => {
          if (state.pendingFlow?.type !== 'vote') return state
          return {
            pendingFlow: {
              type: 'vote',
              draft: { ...state.pendingFlow.draft, ...patch },
            },
          }
        }),

      beginGrowthFeedback: (options, message) =>
        set({ pendingFlow: { type: 'growth_feedback', draft: { options, message } } }),

      saveNominationDraft: async () => {
        const flow = get().pendingFlow
        if (flow?.type !== 'nomination') return
        try {
          await ensureNominationSaved(flow, get, set)
        } catch (err) {
          // Best-effort — if this fails (e.g. a network blip), the draft
          // just isn't saved yet; finalizePendingFlow/completePendingSignIn
          // each call ensureNominationSaved too, so it's retried once the
          // user actually confirms an email, rather than blocking them from
          // moving on to that step.
          console.error('StopSpotter: auto-save of nomination draft failed.', err)
        }
      },

      cancelPendingFlow: () => set({ pendingFlow: null, pendingIdentity: null }),

      finalizePendingFlow: async (identity) => {
        const state = get()
        const flow = state.pendingFlow
        if (!flow) return

        if (isSupabaseConfigured) {
          // Nothing is written here for any flow type — a nomination was
          // already saved by saveNominationDraft before this screen was
          // ever reached; votes and growth feedback wait for
          // completePendingSignIn, same as before.
          await db.sendMagicLink(identity.email!)
          set({ pendingIdentity: identity, authMethod: 'magic_link' })
          return
        }

        // ── Local-only mode ─────────────────────────────────────────────
        const existing = state.currentUser
        const userId = existing?.id ?? `user-${crypto.randomUUID()}`
        set({
          currentUser: {
            id: userId,
            email: identity.email,
            firstName: identity.firstName,
            verified: existing?.verified ?? false,
            consents: buildConsents(identity),
          },
        })

        if (flow.type === 'nomination') {
          // Already saved (anonymous) by saveNominationDraft — this is
          // normally just a no-op lookup of that id.
          const savedId = await ensureNominationSaved(flow, get, set)
          set({ awaitingVerificationId: savedId, awaitingVerificationKind: 'nomination' })
        } else if (flow.type === 'vote') {
          const d = flow.draft
          const vote: Vote = {
            id: `vote-${crypto.randomUUID()}`,
            userId,
            nominationId: d.nominationId,
            payBand: d.payBand ?? 'free_only',
            verified: false,
            createdAt: new Date().toISOString(),
          }
          set((s) => ({ votes: [...s.votes, vote] }))

          // Votes always need a verified email (docs/BUILD_PLAN.md anti-gaming) —
          // finalizePendingFlow is never called anonymously for a vote from the UI,
          // but guard here too rather than trusting the caller.
          set({ awaitingVerificationId: vote.id, awaitingVerificationKind: 'vote' })

          // If the owner wasn't known, fold the voter's answers back into the nomination.
          if (d.ownerType) {
            set((s) => ({
              nominations: s.nominations.map((n) =>
                n.id === d.nominationId
                  ? {
                      ...n,
                      answers: { ...n.answers, ownerType: d.ownerType! },
                      landowner: d.landowner ?? n.landowner,
                    }
                  : n,
              ),
            }))
          }
        } else {
          // growth_feedback — local-only mode has no backend table to write
          // to; still run the same simulated verify step as nomination/vote
          // for a consistent UI, there's just nothing for confirmMagicLink
          // to flip afterwards (see its growth_feedback branch).
          set({
            awaitingVerificationId: `growth-${crypto.randomUUID()}`,
            awaitingVerificationKind: 'growth_feedback',
          })
        }
      },

      confirmMagicLink: () => {
        const { awaitingVerificationId, awaitingVerificationKind, currentUser } = get()
        if (!awaitingVerificationId || !awaitingVerificationKind) return

        if (currentUser) set({ currentUser: { ...currentUser, verified: true } })

        if (awaitingVerificationKind === 'nomination') {
          // Local-only mode's equivalent of claim_nomination — the row was
          // saved anonymously (userId: null) by ensureNominationSaved, so
          // confirming attaches the now-known local user to it here.
          set((s) => ({
            nominations: s.nominations.map((n) =>
              n.id === awaitingVerificationId
                ? { ...n, userId: currentUser?.id ?? n.userId, verified: true }
                : n,
            ),
          }))
        } else if (awaitingVerificationKind === 'vote') {
          set((s) => ({
            votes: s.votes.map((v) =>
              v.id === awaitingVerificationId ? { ...v, verified: true } : v,
            ),
          }))
        }
        // growth_feedback: nothing local to flip — local-only mode never wrote it anywhere.

        set({ pendingFlow: null, awaitingVerificationId: null, awaitingVerificationKind: null })
      },

      signInWithSSO: async (provider, consent) => {
        if (!isSupabaseConfigured || !get().pendingFlow) return
        // Set before calling signInWithOAuth, which navigates the browser
        // away almost immediately — anything set after that call might
        // never actually run.
        set({
          pendingIdentity: { email: null, firstName: consent.firstName, news: consent.news, support: consent.support },
          authMethod: 'oauth',
        })
        await db.signInWithOAuth(provider)
      },

      initRealBackend: async () => {
        if (!isSupabaseConfigured) return

        // Each step below is independently try/caught: a Supabase outage,
        // bad credentials, or any transient network failure must not leave
        // the map stuck on "Loading…" forever (backendReady would never
        // flip true) or prevent the auth listener — by far the most
        // important part, since every future sign-in depends on it — from
        // ever being set up. Found by actually testing a broken-backend
        // scenario, not assumed.
        try {
          const [nominations, votes] = await Promise.all([
            db.fetchPublicNominations(),
            db.fetchPublicVotes(),
          ])
          set({ nominations, votes })
        } catch (err) {
          console.error('StopSpotter: failed to load the live nominations/votes feed.', err)
        } finally {
          set({ backendReady: true })
        }

        const finishSignIn = async (user: { id: string; email?: string }) => {
          if (!user.email) return
          try {
            const hadPending = get().pendingFlow && get().pendingIdentity
            if (hadPending) {
              await completePendingSignIn(get, set, user.id, user.email)
            } else {
              set({ currentUser: { id: user.id, email: user.email, verified: true, consents: [] } })
            }
            const [myNominations, myVotes] = await Promise.all([
              db.fetchMyNominations(user.id),
              db.fetchMyVotes(user.id),
            ])
            set((s) => ({
              nominations: mergeById(s.nominations, myNominations),
              votes: mergeById(s.votes, myVotes),
            }))
          } catch (err) {
            // A failure here (e.g. partway through completePendingSignIn)
            // currently just leaves the user on whatever screen they were
            // on with pendingFlow still set, rather than silently losing
            // their draft — not a full retry/error UI yet, but not a
            // crash or a data loss either. Worth revisiting.
            console.error('StopSpotter: failed to complete sign-in.', err)
          }
        }

        try {
          const existingUser = await db.getCurrentSessionUser()
          if (existingUser) await finishSignIn(existingUser)
        } catch (err) {
          console.error('StopSpotter: failed to check for an existing session.', err)
        }

        db.onAuthStateChange((user) => {
          if (user) void finishSignIn(user)
        })
      },
    }),
    {
      name: 'stopspotter-prototype',
      // Seed data is local-only-mode flavour; never persist it, and never
      // persist the real backend's fetched feed either (initRealBackend
      // re-fetches fresh on every load) — only the genuinely durable bits.
      partialize: (state) => ({
        hasSeenIntro: state.hasSeenIntro,
        currentUser: state.currentUser,
        pendingFlow: state.pendingFlow,
        pendingIdentity: state.pendingIdentity,
        authMethod: state.authMethod,
        ...(isSupabaseConfigured ? {} : { nominations: state.nominations, votes: state.votes }),
      }),
    },
  ),
)

/** Replaces entries that share an id, appends the rest — used to fold "my full data" over the public (column-limited) rows already in state. */
function mergeById<T extends { id: string }>(existing: T[], updates: T[]): T[] {
  const updateIds = new Set(updates.map((u) => u.id))
  return [...existing.filter((e) => !updateIds.has(e.id)), ...updates]
}
