-- StopSpotter — disposable-email blocklist (anti-gaming requirement,
-- previously marked genuinely open in docs/BUILD_PLAN.md)
--
-- Uses Supabase's documented "Before User Created" Auth Hook rather than
-- a trigger added directly to auth.users — GoTrue's own internal schema
-- is not something this project touches (same reasoning as not relocating
-- the postgis extension: unsupported, fragile across Supabase upgrades).
-- The Postgres-function hook is the supported extension point for exactly
-- this ("blocking disposable email domains" is Supabase's own example).
--
-- This runs for EVERY sign-up path (magic link and every SSO provider),
-- since it fires inside Supabase Auth itself before any user row exists —
-- broader coverage than the client-side check in
-- src/lib/disposableEmail.ts, which only guards the magic-link form and
-- is trivially bypassable by calling the API directly. Keep both: the
-- client-side list for instant sign-up feedback, this table for the
-- actual non-bypassable enforcement.
--
-- NOT fully wired up by this migration alone — enabling a Postgres-
-- function Auth Hook is a one-time dashboard toggle (Authentication →
-- Hooks → Before User Created), see docs/SETUP.md. Nothing breaks by
-- skipping that step; sign-ups just aren't blocked until it's done.
create table public.disposable_email_domains (
  domain text primary key
);

-- Same list as src/lib/disposableEmail.ts's client-side check — not
-- exhaustive, kept in sync by eye between the two (no shared source).
insert into public.disposable_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'),
  ('10minutemail.com'), ('10minutemail.net'), ('yopmail.com'), ('yopmail.net'),
  ('tempmail.com'), ('temp-mail.org'), ('trashmail.com'), ('throwawaymail.com'),
  ('getnada.com'), ('dispostable.com'), ('fakeinbox.com'), ('maildrop.cc'),
  ('mintemail.com'), ('sharklasers.com'), ('spam4.me'), ('mytemp.email'),
  ('moakt.com'), ('emailondeck.com'), ('mailnesia.com'), ('mohmal.com'),
  ('inboxkitten.com'), ('tempinbox.com'), ('mailcatch.com'), ('mailtemp.net'),
  ('discard.email'), ('discardmail.com'), ('tmpmail.org'), ('tmpbox.net'),
  ('burnermail.io'), ('mailpoof.com'), ('spambog.com'), ('anonbox.net'),
  ('crazymailing.com'), ('tempail.com'), ('luxusmail.org'), ('mailbox52.ru'),
  ('mailbox92.biz')
on conflict do nothing;

-- Service-role only — nothing for anon/authenticated to read or write
-- here; the hook function below is the only thing that queries it.
alter table public.disposable_email_domains enable row level security;

-- Named explicitly (not "from public") — this platform auto-grants full
-- CRUD to anon/authenticated on every new table at creation time,
-- independent of the PUBLIC pseudo-role. See 0003_grant_hardening.sql.
-- Found again here by checking the live grants directly after applying,
-- not assumed fixed just because the pattern is now known.
revoke all on public.disposable_email_domains from anon, authenticated;

-- security definer: supabase_auth_admin (the only role granted EXECUTE,
-- below) has no table-level grant on disposable_email_domains — it's
-- locked to service-role only, same as this project's other admin-only
-- tables. Without definer rights the internal SELECT fails with
-- "permission denied for table disposable_email_domains" even though the
-- EXECUTE grant itself is correct — found by actually calling this as
-- supabase_auth_admin on the local rig, not assumed from Supabase's own
-- (non-definer) docs example.
create or replace function public.hook_reject_disposable_email (event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  email text;
  v_domain text;
  is_blocked int;
begin
  email := event -> 'user' ->> 'email';
  v_domain := lower(split_part(email, '@', 2));

  select count(*) into is_blocked
  from public.disposable_email_domains
  where domain = v_domain;

  if is_blocked > 0 then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Please sign up with an email address you can actually receive mail at — that looks like a temporary/disposable one.',
        'http_code', 400
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

-- Exact pattern from Supabase's own "Before User Created" hook docs:
-- supabase_auth_admin is the role Supabase Auth itself uses to call this,
-- and it must be the ONLY role that can.
grant execute
  on function public.hook_reject_disposable_email
  to supabase_auth_admin;

revoke execute
  on function public.hook_reject_disposable_email
  from authenticated, anon, public;
