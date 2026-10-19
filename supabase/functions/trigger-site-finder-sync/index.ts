// StopSpotter — "Sync to SiteFinder now" button
// (AdminSiteFinderSettingsScreen.tsx, site_finder_settings table,
// migration 0023).
//
// An admin's edit to a SiteFinder setting only lands in the real
// SiteFinder repo once scripts/sync_config_from_stopspotter.py runs
// there and commits the changed YAML (see that repo's
// .github/workflows/sync-config-from-stopspotter.yml, which runs that
// script on a schedule as a safety net, and on workflow_dispatch).
// Waiting for the schedule could mean up to 6 hours' delay after a
// genuine edit, so this function dispatches that workflow immediately
// instead - same admin action, no separate scheduling concept for the
// admin to think about.
//
// A workflow_dispatch call across repos needs a real GitHub token with
// Actions:write on jamspr95/SiteFinder - the default GITHUB_TOKEN a
// workflow gets automatically only works FROM INSIDE that repo's own
// Actions runs (see build-title-tiles.yml's use of it for its own
// release), not from an outside caller like this edge function. Someone
// with admin on jamspr95/SiteFinder needs to create a fine-grained
// personal access token scoped to ONLY that repo's Actions:write
// permission, then set it as this function's GITHUB_PAT_SITE_FINDER_SYNC
// secret (Supabase dashboard -> Edge Functions -> Secrets, or
// `supabase secrets set`) - never pasted into a chat with an AI
// assistant, same rule as every other credential in this project.
//
// Follows lookup-title-boundary/index.ts's exact template: CORS headers
// (this is called from the browser, so needs the preflight handling that
// function's own header comment explains), and the caller's own JWT
// forwarded to current_user_is_admin() rather than trusting the request.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SITEFINDER_REPO = 'jamspr95/SiteFinder'
const SITEFINDER_DEFAULT_BRANCH = 'main'
const WORKFLOW_FILE = 'sync-config-from-stopspotter.yml'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseAsCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: isAdmin, error: authError } = await supabaseAsCaller.rpc('current_user_is_admin')
  if (authError || !isAdmin) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const githubToken = Deno.env.get('GITHUB_PAT_SITE_FINDER_SYNC')
  if (!githubToken) {
    return new Response(
      JSON.stringify({
        error:
          'GITHUB_PAT_SITE_FINDER_SYNC is not configured on this project yet - see this function\'s own header comment for how to set it up.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${SITEFINDER_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: SITEFINDER_DEFAULT_BRANCH }),
    },
  )

  if (!dispatchRes.ok) {
    const detail = await dispatchRes.text()
    console.error(`GitHub workflow dispatch failed: ${dispatchRes.status} ${detail}`)
    return new Response(
      JSON.stringify({ error: `GitHub rejected the sync request (${dispatchRes.status}).`, detail }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // workflow_dispatch's own response has no body and gives back no run
  // id to poll - GitHub's API doesn't hand one out from this call. The
  // caller only learns the dispatch was accepted, not when it finishes.
  return new Response(JSON.stringify({ dispatched: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
