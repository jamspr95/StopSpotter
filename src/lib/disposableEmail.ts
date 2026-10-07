// Known common disposable/temp-mail domains — not exhaustive (new ones
// appear constantly), but catches the overwhelming majority of casual
// anti-gaming attempts. This is the fast client-side check for immediate
// sign-up feedback; the authoritative, non-bypassable enforcement is the
// matching `disposable_email_domains` table + "Before User Created" Auth
// Hook in supabase/migrations/0005_disposable_email.sql, which a
// determined actor can't route around by skipping the browser. Keep this
// list and that table's seed data in sync by eye — there's no shared
// source between them.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  '10minutemail.com',
  '10minutemail.net',
  'yopmail.com',
  'yopmail.net',
  'tempmail.com',
  'temp-mail.org',
  'trashmail.com',
  'throwawaymail.com',
  'getnada.com',
  'dispostable.com',
  'fakeinbox.com',
  'maildrop.cc',
  'mintemail.com',
  'sharklasers.com',
  'spam4.me',
  'mytemp.email',
  'moakt.com',
  'emailondeck.com',
  'mailnesia.com',
  'mohmal.com',
  'inboxkitten.com',
  'tempinbox.com',
  'mailcatch.com',
  'mailtemp.net',
  'discard.email',
  'discardmail.com',
  'tmpmail.org',
  'tmpbox.net',
  'burnermail.io',
  'mailpoof.com',
  'spambog.com',
  'anonbox.net',
  'crazymailing.com',
  'tempail.com',
  'luxusmail.org',
  'mailbox52.ru',
  'mailbox92.biz',
])

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim()
  return Boolean(domain && DISPOSABLE_EMAIL_DOMAINS.has(domain))
}
