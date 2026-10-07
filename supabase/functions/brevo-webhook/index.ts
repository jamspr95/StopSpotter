// Receives a status-change notification from a Brevo Automation workflow
// (configured to fire when a Deal moves pipeline stage — see
// docs/SETUP.md "Brevo deal-stage webhook") and writes the matching
// nominations.status + a status_history row.
//
// NOT verified against a live Brevo account — there's no Brevo API key or
// account access in this environment. The payload shape below is a
// CONTRACT this function expects, not something Brevo sends natively:
// Brevo's Automation workflow editor lets you build the outgoing
// webhook's JSON body yourself, so the Brevo side has to be configured to
// send exactly this shape (docs/SETUP.md walks through that). It also
// depends on a nomination_id custom field existing on the Brevo deal,
// which in turn depends on "Auto-create a Brevo deal... when a nomination
// passes initial moderation" (docs/BUILD_PLAN.md) — that half is NOT
// built (it would mean guessing Brevo's REST API request shape with no
// way to verify it against a real account, unlike this direction where
// the contract is StopSpotter's own to define). So this function is
// ready to receive the webhook once that other half and the Brevo
// automation both exist; it can't be exercised end-to-end before then.

import { createClient } from 'npm:@supabase/supabase-js@2'

// Edit to match the exact stage names in the real Brevo Deals pipeline
// (docs/SETUP.md "Brevo CRM pipeline setup") — these are placeholders
// based on the nominations.status enum, not confirmed against a real
// Brevo pipeline.
const STAGE_TO_STATUS: Record<string, string> = {
  New: 'submitted',
  'Under review': 'under_review',
  Shortlisted: 'shortlisted',
  Live: 'live',
  'Not suitable': 'not_suitable',
}

interface WebhookPayload {
  nomination_id: string
  stage_name: string
  note?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Brevo's webhook action can send a custom header — set this to match
  // whatever's configured there, as a shared secret (docs/SETUP.md).
  const sharedSecret = Deno.env.get('BREVO_WEBHOOK_SECRET')
  if (sharedSecret && req.headers.get('x-webhook-secret') !== sharedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!payload.nomination_id) {
    return new Response('Missing nomination_id', { status: 400 })
  }
  const newStatus = STAGE_TO_STATUS[payload.stage_name]
  if (!newStatus) {
    return new Response(`Unknown stage: ${payload.stage_name}`, { status: 400 })
  }

  // Service role bypasses RLS/grants entirely — fine here because this is
  // a trusted server-to-server call authenticated by the shared secret
  // above, never something the browser calls directly. Supabase provides
  // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to every edge function
  // automatically — nothing to set manually for these two.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: existing, error: fetchError } = await supabase
    .from('nominations')
    .select('status')
    .eq('id', payload.nomination_id)
    .single()

  if (fetchError || !existing) {
    return new Response('Nomination not found', { status: 404 })
  }

  const { error: updateError } = await supabase
    .from('nominations')
    .update({ status: newStatus })
    .eq('id', payload.nomination_id)

  if (updateError) {
    return new Response(`Update failed: ${updateError.message}`, { status: 500 })
  }

  await supabase.from('status_history').insert({
    nomination_id: payload.nomination_id,
    from_status: existing.status,
    to_status: newStatus,
    changed_by: 'brevo-webhook',
    note: payload.note ?? null,
  })

  return new Response('OK', { status: 200 })
})
