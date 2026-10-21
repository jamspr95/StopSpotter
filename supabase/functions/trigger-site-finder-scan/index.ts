// StopSpotter — "Scan a new area" button (AdminSiteFinderSearchScreen.tsx)
//
// Dispatches SiteFinder's new scan-on-demand.yml workflow
// (jamspr95/SiteFinder) for an ad-hoc point an admin picks in this
// screen — the pipeline runs against that one point instead of one of
// its hardcoded test areas, and syncs whatever it finds straight into
// site_finder_raw_candidates for review here. Fire-and-forget, same as
// trigger-site-finder-sync: GitHub's workflow_dispatch API gives back no
// run id to poll, so this only confirms the request was accepted —
// results show up in the pending list once the scan (minutes to over an
// hour, depending on radius) finishes on its own.
//
// Follows trigger-site-finder-sync's exact template, including reusing
// the SAME GITHUB_PAT_SITE_FINDER_SYNC secret — that token already has
// Actions:write on jamspr95/SiteFinder, which is all either workflow
// dispatch needs, so there's nothing new to configure for this feature.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SITEFINDER_REPO = 'jamspr95/SiteFinder'
const SITEFINDER_DEFAULT_BRANCH = 'main'
const WORKFLOW_FILE = 'scan-on-demand.yml'
const NATIONS = ['england', 'wales', 'scotland']

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

  let payload: { lat?: number; lng?: number; radiusKm?: number; nation?: string; label?: string }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders })
  }
  if (
    typeof payload.lat !== 'number' ||
    typeof payload.lng !== 'number' ||
    typeof payload.radiusKm !== 'number' ||
    payload.radiusKm <= 0 ||
    !NATIONS.includes(payload.nation ?? '')
  ) {
    return new Response(
      'Body must be { lat: number, lng: number, radiusKm: number (> 0), nation: "england"|"wales"|"scotland", label?: string }',
      { status: 400, headers: corsHeaders },
    )
  }

  const githubToken = Deno.env.get('GITHUB_PAT_SITE_FINDER_SYNC')
  if (!githubToken) {
    return new Response(
      JSON.stringify({
        error:
          'GITHUB_PAT_SITE_FINDER_SYNC is not configured on this project yet - see docs/SETUP.md §12a.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // workflow_dispatch's inputs are always strings on the wire, whatever
  // type the workflow file declares them as (scan-on-demand.yml's own
  // lat/lng/radius_km are declared `type: string` for exactly this
  // reason — GitHub Actions has no numeric input type at all).
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${SITEFINDER_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: SITEFINDER_DEFAULT_BRANCH,
        inputs: {
          lat: String(payload.lat),
          lng: String(payload.lng),
          radius_km: String(payload.radiusKm),
          nation: payload.nation,
          label: payload.label ?? '',
        },
      }),
    },
  )

  if (!dispatchRes.ok) {
    const detail = await dispatchRes.text()
    console.error(`GitHub workflow dispatch failed: ${dispatchRes.status} ${detail}`)
    return new Response(
      JSON.stringify({ error: `GitHub rejected the scan request (${dispatchRes.status}).`, detail }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(JSON.stringify({ dispatched: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
