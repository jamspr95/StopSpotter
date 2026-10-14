// StopSpotter — automatic content moderation for a nomination's "why
// here" text and any landowner lead text submitted alongside it (the
// "Decide on an automatic moderation approach" launch-checklist item,
// and the still-open row in docs/BUILD_PLAN.md: "Automatic AI moderation
// check (offensive content, personal details, home/garden pins) ...").
//
// Scope note: this covers offensive/abusive TEXT only, via OpenAI's
// moderation endpoint — chosen over Google's Perspective API (sunsetting
// 31 Dec 2026) and AWS Comprehend Toxicity Detection (no free tier, bills
// from the first request). It does NOT cover the other half BUILD_PLAN
// mentions ("pins on homes/gardens") — a geospatial check, not a text
// one, and a separate piece of work.
//
// Called once, fire-and-forget, right after a nomination is first saved
// (useAppStore's ensureNominationSaved -> db.moderateNomination) — never
// blocks or fails a submission. No admin/auth check on this endpoint:
// anon/authenticated can already insert a moderation_reports row
// directly ("Anyone can report a stop", 0001_init.sql) with whatever
// reason text they like, so this automates exactly that, rather than
// granting any new privilege a bad actor couldn't already reach by hand.
//
// If OPENAI_API_KEY isn't configured yet, this logs and no-ops — see
// 0020_auto_moderation.sql's header comment for why that's a deliberate
// fail-open (text stays publicly visible, same as before this function
// existed), not a thrown error.
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODERATION_MODEL = 'omni-moderation-latest'

interface OpenAiModerationResult {
  flagged: boolean
  categories: Record<string, boolean>
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let payload: { nominationId?: string }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  if (!payload.nominationId) {
    return new Response('Missing nominationId', { status: 400 })
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — skipping automatic moderation check (text stays visible, unchecked).')
    return new Response(JSON.stringify({ flagged: false, skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Service role bypasses RLS — needed to read why_here/landowner text
  // regardless of who's calling, and to flip why_here_moderation /
  // insert a moderation_reports row with reporter_id null (no auth.users
  // row to attribute an automatic flag to). Supabase provides SUPABASE_URL
  // and SUPABASE_SERVICE_ROLE_KEY to every edge function automatically.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const [{ data: nomination, error: nominationError }, { data: leads }] = await Promise.all([
    supabase.from('nominations').select('why_here').eq('id', payload.nominationId).single(),
    supabase.from('landowner_leads').select('owner_name_or_org, contact').eq('nomination_id', payload.nominationId),
  ])
  if (nominationError || !nomination) {
    return new Response('Nomination not found', { status: 404 })
  }

  const texts = [nomination.why_here, ...(leads ?? []).flatMap((l) => [l.owner_name_or_org, l.contact])].filter(
    (t): t is string => Boolean(t && t.trim()),
  )
  if (texts.length === 0) {
    return new Response(JSON.stringify({ flagged: false, checked: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const moderationRes = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODERATION_MODEL, input: texts }),
  })
  if (!moderationRes.ok) {
    console.error(`OpenAI moderation request failed: ${moderationRes.status} ${await moderationRes.text()}`)
    return new Response('Moderation check failed upstream', { status: 502 })
  }

  const moderationBody: { results: OpenAiModerationResult[] } = await moderationRes.json()

  const flaggedCategories = new Set<string>()
  let anyFlagged = false
  for (const result of moderationBody.results) {
    if (!result.flagged) continue
    anyFlagged = true
    for (const [category, hit] of Object.entries(result.categories)) {
      if (hit) flaggedCategories.add(category)
    }
  }

  if (anyFlagged) {
    await Promise.all([
      supabase
        .from('nominations')
        .update({ why_here_moderation: 'flagged' })
        .eq('id', payload.nominationId),
      supabase.from('moderation_reports').insert({
        nomination_id: payload.nominationId,
        reporter_id: null,
        reason: `Auto-flagged by moderation API: ${[...flaggedCategories].join(', ')}`,
      }),
    ])
  }

  return new Response(JSON.stringify({ flagged: anyFlagged, categories: [...flaggedCategories] }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
