import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True once real Supabase credentials are present. Everything in
 * src/lib/db.ts branches on this — unconfigured, the app stays in the
 * Milestone 1 local-only mode (Zustand + localStorage, no network calls),
 * so the deployed prototype keeps working for usability testing even
 * before a Supabase project exists. See docs/SETUP.md.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

// Narrowing on `url && anonKey` directly (not the isSupabaseConfigured alias)
// is what lets TS treat both as `string` in the true branch.
export const supabase = url && anonKey ? createClient(url, anonKey) : null

/**
 * The "Continue with Google/Apple/Facebook" buttons are only worth showing
 * once at least one provider is actually configured in the Supabase
 * dashboard (docs/SETUP.md §6) — until then, tapping one just fails with a
 * provider-not-enabled error, which is worse than not offering it. Off by
 * default; flip VITE_SSO_ENABLED=true once a provider is live.
 */
export const isSSOEnabled = import.meta.env.VITE_SSO_ENABLED === 'true'
