import { create } from 'zustand'
import * as db from '../lib/db'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import type {
  AdminGrowthFeedback,
  AdminModerationReport,
  AdminNomination,
  NominationStatus,
  SiteFinderSetting,
} from '../types'

export type AdminSessionStatus = 'checking' | 'signed_out' | 'not_admin' | 'admin'

interface AdminState {
  sessionStatus: AdminSessionStatus
  adminEmail: string | null
  nominations: AdminNomination[]
  nominationsLoading: boolean
  titleLookupLoadingId: string | null
  moderationReports: AdminModerationReport[]
  moderationLoading: boolean
  growthFeedback: AdminGrowthFeedback[]
  growthFeedbackLoading: boolean
  siteFinderSettings: SiteFinderSetting[]
  siteFinderSettingsLoading: boolean
  error: string | null

  checkSession: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  loadNominations: () => Promise<void>
  loadModerationReports: (includeResolved?: boolean) => Promise<void>
  updateNominationStatus: (
    nominationId: string,
    status: NominationStatus,
    note?: string,
  ) => Promise<void>
  resolveModerationReport: (reportId: string) => Promise<void>
  lookupNominationTitle: (nominationId: string) => Promise<void>
  loadGrowthFeedback: () => Promise<void>
  updateGrowthFeedback: (
    id: string,
    patch: { actioned?: boolean; crmSynced?: boolean },
  ) => Promise<void>
  loadSiteFinderSettings: () => Promise<void>
  updateSiteFinderSetting: (key: string, value: number) => Promise<void>
  syncSiteFinderNow: () => Promise<void>
}

export const useAdminStore = create<AdminState>()((set, get) => ({
  sessionStatus: 'checking',
  adminEmail: null,
  nominations: [],
  nominationsLoading: false,
  titleLookupLoadingId: null,
  moderationReports: [],
  moderationLoading: false,
  growthFeedback: [],
  growthFeedbackLoading: false,
  siteFinderSettings: [],
  siteFinderSettingsLoading: false,
  error: null,

  checkSession: async () => {
    if (!isSupabaseConfigured) {
      set({ sessionStatus: 'signed_out' })
      return
    }
    try {
      const user = await db.getCurrentSessionUser()
      if (!user) {
        set({ sessionStatus: 'signed_out', adminEmail: null })
        return
      }
      const isAdmin = await db.isCurrentUserAdmin()
      set({
        sessionStatus: isAdmin ? 'admin' : 'not_admin',
        adminEmail: user.email ?? null,
      })
    } catch (err) {
      set({
        sessionStatus: 'signed_out',
        error: err instanceof Error ? err.message : 'Could not check the admin session.',
      })
    }
  },

  signIn: async (email, password) => {
    set({ error: null })
    await db.adminSignIn(email, password)
    await get().checkSession()
    if (get().sessionStatus === 'not_admin') {
      await db.adminSignOut()
      set({ sessionStatus: 'signed_out', error: 'That account is not set up as an admin.' })
    }
  },

  signOut: async () => {
    await db.adminSignOut()
    set({
      sessionStatus: 'signed_out',
      adminEmail: null,
      nominations: [],
      moderationReports: [],
      growthFeedback: [],
      siteFinderSettings: [],
    })
  },

  loadNominations: async () => {
    set({ nominationsLoading: true, error: null })
    try {
      const nominations = await db.adminListNominations()
      set({ nominations, nominationsLoading: false })
    } catch (err) {
      set({
        nominationsLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load stops.',
      })
    }
  },

  loadModerationReports: async (includeResolved = false) => {
    set({ moderationLoading: true, error: null })
    try {
      const moderationReports = await db.adminListModerationReports(includeResolved)
      set({ moderationReports, moderationLoading: false })
    } catch (err) {
      set({
        moderationLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load moderation reports.',
      })
    }
  },

  updateNominationStatus: async (nominationId, status, note) => {
    await db.adminUpdateNominationStatus(nominationId, status, note)
    set((s) => ({
      nominations: s.nominations.map((n) => (n.id === nominationId ? { ...n, status } : n)),
    }))
  },

  resolveModerationReport: async (reportId) => {
    await db.adminResolveModerationReport(reportId)
    set((s) => ({
      moderationReports: s.moderationReports.filter((r) => r.id !== reportId),
    }))
  },

  lookupNominationTitle: async (nominationId) => {
    const nomination = get().nominations.find((n) => n.id === nominationId)
    if (!nomination) return
    set({ titleLookupLoadingId: nominationId, error: null })
    try {
      const { titleNumber, titleTenure, titleGeometry } = await db.lookupNominationTitle(
        nominationId,
        nomination.exact.lat,
        nomination.exact.lng,
      )
      set((s) => ({
        titleLookupLoadingId: null,
        nominations: s.nominations.map((n) =>
          n.id === nominationId
            ? { ...n, titleNumber, titleTenure, titleGeometry, titleCheckedAt: new Date().toISOString() }
            : n,
        ),
      }))
    } catch (err) {
      set({
        titleLookupLoadingId: null,
        error: err instanceof Error ? err.message : 'Title lookup failed.',
      })
    }
  },

  loadGrowthFeedback: async () => {
    set({ growthFeedbackLoading: true, error: null })
    try {
      const growthFeedback = await db.adminListGrowthFeedback()
      set({ growthFeedback, growthFeedbackLoading: false })
    } catch (err) {
      set({
        growthFeedbackLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load growth feedback.',
      })
    }
  },

  updateGrowthFeedback: async (id, patch) => {
    await db.adminUpdateGrowthFeedback(id, patch)
    set((s) => ({
      growthFeedback: s.growthFeedback.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }))
  },

  loadSiteFinderSettings: async () => {
    set({ siteFinderSettingsLoading: true, error: null })
    try {
      const siteFinderSettings = await db.adminListSiteFinderSettings()
      set({ siteFinderSettings, siteFinderSettingsLoading: false })
    } catch (err) {
      set({
        siteFinderSettingsLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load SiteFinder settings.',
      })
    }
  },

  updateSiteFinderSetting: async (key, value) => {
    await db.adminUpdateSiteFinderSetting(key, value)
    set((s) => ({
      siteFinderSettings: s.siteFinderSettings.map((setting) =>
        setting.key === key ? { ...setting, value } : setting,
      ),
    }))
  },

  syncSiteFinderNow: async () => {
    await db.triggerSiteFinderSync()
  },
}))
