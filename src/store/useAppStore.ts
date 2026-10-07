import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { guessCouncilArea, snapToPublicGrid } from '../lib/geo'
import { scoreNomination } from '../lib/scoring'
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
}

interface DraftVote {
  nominationId: string
  /** Only asked when the stop's owner isn't yet known — see docs/BUILD_PLAN.md. */
  ownerType?: OwnerType
  landowner?: DraftNomination['landowner']
  payBand?: PayBand
}

type PendingFlow =
  | { type: 'nomination'; draft: DraftNomination }
  | { type: 'vote'; draft: DraftVote }
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
  /** Id of the nomination/vote just created, awaiting the simulated magic-link click. */
  awaitingVerificationId: string | null
  awaitingVerificationKind: 'nomination' | 'vote' | null

  markIntroSeen: () => void
  beginNomination: (pin: LatLng) => void
  updateNominationDraft: (patch: Partial<DraftNomination>) => void
  beginVote: (nominationId: string) => void
  updateVoteDraft: (patch: Partial<DraftVote>) => void
  cancelPendingFlow: () => void
  /** Creates the nomination/vote record. Anonymous (email === null) records are saved immediately as unverified; email-backed ones wait for confirmMagicLink(). */
  finalizePendingFlow: (identity: Identity) => void
  confirmMagicLink: () => void
}

function buildConsents(identity: Identity): ConsentRecord[] {
  const now = new Date().toISOString()
  return [
    { purpose: 'news', granted: identity.news, wordingVersion: CONSENT_WORDING_VERSION, timestamp: now },
    { purpose: 'support', granted: identity.support, wordingVersion: CONSENT_WORDING_VERSION, timestamp: now },
  ]
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasSeenIntro: false,
      nominations: seedNominations,
      votes: seedVotes,
      currentUser: null,
      pendingFlow: null,
      awaitingVerificationId: null,
      awaitingVerificationKind: null,

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

      cancelPendingFlow: () => set({ pendingFlow: null }),

      finalizePendingFlow: (identity) => {
        const state = get()
        const flow = state.pendingFlow
        if (!flow) return

        const anonymous = identity.email === null
        let userId: string | null = null

        if (!anonymous) {
          const existing = state.currentUser
          const id = existing?.id ?? `user-${crypto.randomUUID()}`
          userId = id
          set({
            currentUser: {
              id,
              email: identity.email,
              firstName: identity.firstName,
              verified: existing?.verified ?? false,
              consents: buildConsents(identity),
            },
          })
        }

        if (flow.type === 'nomination') {
          const d = flow.draft
          const answers = d.answers as NominationAnswers
          const exact = d.pin
          const nomination: Nomination = {
            id: `nom-${crypto.randomUUID()}`,
            userId,
            exact,
            public: snapToPublicGrid(exact),
            councilArea: guessCouncilArea(exact),
            answers,
            whyHere: d.whyHere,
            payBand: d.payBand ?? 'free_only',
            criteria: scoreNomination(answers),
            ownershipHint:
              answers.ownerType === 'i_own_it'
                ? 'Nominator says they own this stop'
                : 'No ownership hint yet (site finder check runs in Milestone 2)',
            landowner: d.landowner,
            status: 'submitted',
            verified: anonymous ? false : false,
            source: 'user',
            createdAt: new Date().toISOString(),
          }

          set((s) => ({ nominations: [...s.nominations, nomination] }))

          if (anonymous) {
            // Anonymous nominations stay unverified permanently in this prototype —
            // there's no email to confirm. They're still saved as stop data.
            set({ pendingFlow: null })
          } else {
            set({
              awaitingVerificationId: nomination.id,
              awaitingVerificationKind: 'nomination',
            })
          }
        } else {
          const d = flow.draft
          const vote: Vote = {
            id: `vote-${crypto.randomUUID()}`,
            userId: userId ?? 'unknown',
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
        }
      },

      confirmMagicLink: () => {
        const { awaitingVerificationId, awaitingVerificationKind, currentUser } = get()
        if (!awaitingVerificationId || !awaitingVerificationKind) return

        if (currentUser) set({ currentUser: { ...currentUser, verified: true } })

        if (awaitingVerificationKind === 'nomination') {
          set((s) => ({
            nominations: s.nominations.map((n) =>
              n.id === awaitingVerificationId ? { ...n, verified: true } : n,
            ),
          }))
        } else {
          set((s) => ({
            votes: s.votes.map((v) =>
              v.id === awaitingVerificationId ? { ...v, verified: true } : v,
            ),
          }))
        }

        set({ pendingFlow: null, awaitingVerificationId: null, awaitingVerificationKind: null })
      },
    }),
    { name: 'stopspotter-prototype' },
  ),
)
