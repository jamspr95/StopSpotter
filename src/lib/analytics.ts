import { supabase, isSupabaseConfigured } from './supabaseClient'

const CAMPAIGN_STORAGE_KEY = 'stopspotter_campaign'

export type AnalyticsEventType =
  | 'pageview'
  | 'share_click'
  | 'nomination_submit'
  | 'vote_submit'
  | 'growth_feedback_submit'

/**
 * First-touch attribution: captures utm_campaign (or utm_source as a
 * fallback) from the URL once, on whichever page a visitor first lands
 * on, and keeps it in localStorage for every event logged afterwards in
 * this browser. Doesn't overwrite an existing value — a later visit with
 * no campaign param (or a different one) shouldn't erase who actually
 * brought this visitor here first.
 */
export function captureCampaignFromUrl(search: string): void {
  try {
    if (localStorage.getItem(CAMPAIGN_STORAGE_KEY)) return
    const params = new URLSearchParams(search)
    const campaign = params.get('utm_campaign') ?? params.get('utm_source')
    if (campaign) localStorage.setItem(CAMPAIGN_STORAGE_KEY, campaign)
  } catch {
    // localStorage unavailable (private browsing etc.) — analytics is
    // best-effort, never worth failing the page load over.
  }
}

export function getCampaign(): string | null {
  try {
    return localStorage.getItem(CAMPAIGN_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Appends this browser's attributed campaign to an outgoing share URL. */
export function withCampaignParam(url: string, medium: string): string {
  const campaign = getCampaign()
  const u = new URL(url)
  u.searchParams.set('utm_source', 'stopspotter')
  u.searchParams.set('utm_medium', medium)
  if (campaign) u.searchParams.set('utm_campaign', campaign)
  return u.toString()
}

/**
 * Fire-and-forget, cookieless event log — no third-party analytics
 * vendor, just an insert-only row in Supabase (see
 * supabase/migrations/0004_analytics.sql). A no-op in local-only mode,
 * and never throws: a failed analytics write must never block or crash
 * the thing the user was actually doing.
 */
export function logEvent(eventType: AnalyticsEventType, path?: string): void {
  if (!isSupabaseConfigured || !supabase) return
  void supabase
    .from('analytics_events')
    .insert({ event_type: eventType, path: path ?? null, campaign: getCampaign() })
    .then(({ error }) => {
      if (error) console.error('StopSpotter: analytics event failed to log.', error)
    })
}
