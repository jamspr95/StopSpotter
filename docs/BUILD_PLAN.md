# StopSpotter — Build Plan

> Source: [StopSpotter MVP Design Spec](https://claude.ai/artifact/CA5foCYZaKJbr5QG6PV3wH) (Jamie Spratt, 2026-10-06).
> This is the engineering task breakdown behind `docs/PROJECT_PLAN.md`'s
> milestones. Build it as a single mobile-first web app with Claude Code,
> reusing the stack and land data from AireStop's public-land site finder
> where possible. No native app.

## Status Key

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |

---

## Tech stack

| Part | Choice | Why |
|---|---|---|
| Map | MapLibre or Leaflet, OpenStreetMap tiles, a satellite layer | Free or low cost, works well on phones |
| Database and sign-in | Supabase (Postgres with PostGIS, built-in magic-link login) | Spatial queries, auth and storage in one place |
| Council areas | ONS local authority boundaries | Free, official, matches how councils think |
| Ownership check | Site finder for public land; manual Land Registry title search by admins for other promising sites | Avoids rebuilding land data |
| Email | Brevo for supporters, synced with consent flags; Gmail for landowner outreach | One list, one place to manage unsubscribes |
| Sales pipeline | Brevo CRM (Deals module) | Already in the stack for supporter email; deals can link straight to the nominator's contact |
| Analytics | Cookieless analytics with campaign tags on Facebook links | Measures the funnel without a cookie banner |

---

## Data model

Seven tables. Consent is its own table so every opt-in is recorded with the
wording shown and when it was given.

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, email, first_name (optional), verified_at, source, created_at | No phone, address or home location |
| `consents` | user_id, purpose, granted, wording_version, timestamp | One row per purpose per change; never overwritten |
| `nominations` | id, user_id, exact_lat, exact_lng, public_lat, public_lng, council_area, answers 1–8, why_here, criteria_score, flags, owner_type, ownership_hint, status, verified, created_at | Exact coordinates admin-only; `user_id` empty for anonymous nominations; `source` = user, site finder, or both |
| `landowner_leads` | id, nomination_id, owner_name_or_org, contact (optional), how_known, happy_to_be_contacted, created_at | Admin-only; never public; deleted if the site is rejected |
| `votes` | id, user_id, nomination_id, pay_band, verified, created_at | One vote per user per nomination |
| `status_history` | nomination_id, from_status, to_status, changed_by, note, timestamp | Drives "My spots" updates and audit trail |
| `moderation_reports` | nomination_id, reporter_id, reason, resolved, timestamp | From the report button on a site card |

Council-area summaries (nominations, votes, pay-band split, top nearby
features) are calculated from these tables rather than stored separately.

---

## Screens (8, phone-first)

| # | Screen | Purpose | Key elements | Primary action |
|---|---|---|---|---|
| 1 | Map (home) | Show what's been spotted | Full-screen map, approximate markers, council-area heat when zoomed out, running total, short first-visit intro | Spot a site |
| 2 | Site card | Let people back a nomination | Site type, nearby features, "why here" quote, vote count, share of voters who'd pay | I'd stay here |
| 3 | Drop pin | Place a nomination | Crosshair pin, place/postcode search, map/satellite toggle, guidance text | Confirm location |
| 4 | Nomination form | Capture site data | 8 questions (see below), progress bar, one question per screen on mobile | Submit |
| 5 | Sign-up | Verify the person, record consent | Email, optional first name, separate unticked opt-ins, privacy notice link, "Submit without email" link | Send my link |
| 6 | Done and share | Reward and spread | "Your spot is in", prefilled Facebook share, invite to vote nearby, support prompt | Share |
| 7 | My spots | Close the loop | Nominations/votes with status (Submitted, Under review, Shortlisted, Live, Not suitable), synced from the sales pipeline | View site |
| 8 | Support | Pre-crowdfunder: ask for more stop suggestions. Post-launch: convert to backing | What AireStop is doing; primary CTA is "Spot a site" until the crowdfunder is live, then supporter tier/crowdfunder links take over; a "Coming soon" note covers the gap; back-to-map button | Spot a site (Back AireStop once live) |

### Interaction rules
- Duplicate check at pin drop: an existing nomination within 200m is offered as a vote first.
- The form completes before sign-up; the nomination/vote is saved as pending and counts once the magic link is clicked.
- Sign-up offers "Submit without email" — anonymous nominations are stored as site data, flagged unverified, and pass through automatic moderation before going public. Votes always need a verified email.
- Magic link signs in and verifies in one step, no passwords.
- "Use my location" centres the map only — the user's own location is never stored.
- Share links open the map zoomed to the shared site, card open.

---

## Nomination form (8 questions + scoring)

Each question ties to a site criterion; feeds an automatic criteria score
admins use to triage. ~45 seconds to complete.

| # | Question | Answer type | Criterion | Score |
|---|---|---|---|---|
| 1 | What kind of place is it? | Single: Unused land / Grass or field / Lay-by / Car park / Other | Vacant land preferred; car parks often blocked | +2 unused land/grass, 0 other, −2 car park |
| 2 | Who owns it, if you know? | Single: Council / Other public body / Business / Private individual / I own it / Don't know | Who to approach | Not scored; "I own it" flagged as a priority lead |
| 3 | How far is the nearest house? | Single: Under 20m / 20–50m / Over 50m / Not sure | At least 20m to a house | Fails under 20m; +1 over 50m |
| 4 | Is the ground fairly flat? | Single: Flat / Gentle slope / Steep | 5% max slope | +1 flat; fails steep |
| 5 | Room for 5+ motorhomes? | Single: Yes / Not sure / No | 5 vans at 60m² each (300m²) | Fails no |
| 6 | What's within a 10-min walk? | Multi: Pub / Shop / Town centre / Attraction / Beach or trail / None | ~800m of a town, pub or attraction | +1 per item, max +3 |
| 7 | Water or drainage nearby? | Single: Toilet block / Water tap / Both / Don't know | Mains water + foul drain | +2 both, +1 one |
| 8 | Would you stay here? | Single: Free only / Up to £10 / £10–15 / £15–20 / £20+ | Demand and willingness to pay | Recorded, not scored |

Plus optional free text "Why here?" (280 chars), shown on the public card
after moderation.

**Landowner follow-up** (when Q2 answer isn't "Don't know"): owner name/org,
how known (I own it / I know them / Public information), contact details
(only when owner is the nominator or an organisation), and — if the
nominator owns it — "happy to be contacted?". This is the best lead the tool
can produce; surface it first to admins.

**System-added fields** (no user input): council area (from pin coordinates
vs. local authority boundaries), ownership hints from the site finder, and
the criteria score/pass-fail flag (a "fail" still saves the site — users may
be wrong).

**Voting** asks only Q8, unless the site's owner isn't yet known — then the
voter also gets Q2 and the landowner follow-up, so votes can help establish
ownership.

---

## Privacy, consent and moderation requirements

Treat as engineering requirements, not just design notes — see
`docs/PROJECT_PLAN.md` open questions for the legal review that must happen
before launch.

- Email collection (service-necessary) and marketing/support consent are
  separate, unticked checkboxes — never bundled or pre-ticked.
- Every consent (`granted`, `wording_version`, `timestamp`) is recorded as a
  new row, never overwritten, so the list is defensible later.
- Unverified email addresses are deleted after 30 days; the site data they
  submitted is kept with no personal data attached.
- One-click unsubscribe on every marketing email; "My spots" has a
  delete-account option that anonymises the user's nominations.
- No cookie banner needed if analytics stays cookieless — don't add a Meta
  pixel without adding consent UI to match.
- Landowner personal details (private owner's name) are admin-only, never
  published, and deleted if the site is rejected.
- Investment communications (equity raise) must never go to this list
  without an approved financial promotion (FCA rules); the "support AireStop"
  opt-in covers rewards crowdfunding and supporter tiers only, not equity.

### Map visibility

| What | Public sees | Admin sees |
|---|---|---|
| Location | Marker snapped to ~1km grid, no address | Exact pin, satellite view |
| Zoomed out | Heat by council area, with counts | Same, plus filters |
| "Why here" text | After moderation | Always |
| Landowner details | Never | Full detail, for outreach |
| Sites in landowner talks | Hidden, or "in progress" with no marker | Full detail |
| Rejected sites | Hidden | Kept with reason |

### Moderation (automatic by default — admin time is very limited)
- Free text and new pins pass an automatic AI check (offensive content,
  personal details, pins on homes/gardens) and publish unless flagged.
- Only flagged items reach the admin queue; admins review in short batches
  (e.g. weekly).
- Report button on every site card feeds the moderation table.

### Anti-gaming
- One vote per verified email per site.
- Disposable email domains blocked at sign-up.
- Cap of 50 nominations per user per day.
- Nominations within 200m offered as votes first.
- Backing AireStop never changes a site's votes or ranking.

---

## Admin view & council reporting

Password-protected, desktop-first.

- Site list, filterable by council area, status, criteria score, pass/fail
  flags and vote count.
- Exact map with satellite view and any landowner details alongside.
- Status synced automatically from the sales pipeline (no manual updates in
  StopSpotter). Only public-safe stages (Submitted, Under review,
  Shortlisted, Live, Not suitable) reach users and trigger an automatic
  email; landowner contact/negotiation stages stay private.
- Moderation queue for free text and reports.
- Supporter sync to Brevo with consent flags (opted-in users only).
  Landowner outreach happens from Gmail using the landowner leads table.

**Demand report** (PDF and CSV, per site or per council area): headline
supporter count and price-band willingness, shortlisted sites with criteria
scores and nearby features, a small map of approximate locations, a
selection of anonymised "why here" quotes, and a date range/method note.
This is the piece to show any landowner before asking about land.

---

## Sales pipeline (Brevo CRM)

Brevo's Deals module is the system of record for a nomination's status once
it enters the pipeline — admins work the pipeline in Brevo, not in
StopSpotter, and StopSpotter only reflects what Brevo says.

- **Pipeline stages** map directly onto the public-safe statuses (Submitted,
  Under review, Shortlisted, Live, Not suitable), plus private stages for
  landowner contact/negotiation that never reach StopSpotter users.
- **Deal creation**: when a nomination passes initial automatic moderation,
  create a Brevo deal linked to the nominator's Brevo contact (the same
  contact created at sign-up, consent flags and all).
- **Landowner-only deals** (e.g. a council-owned site with no linked
  nominator, or where outreach is the main activity) get a dedicated Brevo
  contact so the deal has something to attach to — but that contact:
  - sits in a separate list, excluded from every marketing automation,
  - has no marketing consent recorded (there's no lawful basis for it),
  - is never emailed from Brevo — outreach stays in Gmail, per the existing
    decision.
- **Sync direction**: a Brevo webhook (deal stage changed) calls a StopSpotter
  endpoint (a Supabase Edge Function). The function maps the Brevo stage to
  the public status enum, writes `nominations.status` and a new
  `status_history` row, and — only for public-safe stages — triggers the
  existing applicant status email. Private stage changes update nothing
  user-facing.
- **No reverse sync**: StopSpotter never writes back to Brevo deal stages;
  admins move deals forward in Brevo only. This keeps "no manual updates in
  StopSpotter" true for status.

## Site finder integration

See `docs/PROJECT_PLAN.md` § Relationship to the site finder for the product
rationale. Engineering implications:

- `nominations` and the site finder's candidate table need a shared `source`
  field (`site finder` / `user` / `both`) — likely a shared targets table or
  a sync job, to be decided during Milestone 1.
- Site finder candidates passing hard criteria render as a visually distinct
  "Suggested by AireStop" marker; release in small batches per area.
- Every user pin needs to run through the site finder's automatic checks
  (size, distance to housing, slope, likely public ownership) to populate
  `ownership_hint` and supplement the criteria score.
- A matching job merges a user pin into an existing site finder candidate
  record when within 200m.
- A combined priority score (site fit + demand + ownership known) feeds the
  sales pipeline.

---

## Build sequence

### Milestone 1 — Clickable prototype

| Task | Status |
|---|---|
| Set up web app scaffold (mobile-first, single app, no native) | ✅ Vite + React + TypeScript |
| Integrate MapLibre/Leaflet with OSM tiles + satellite layer toggle | ✅ Leaflet; satellite via Esri World Imagery |
| Drop-pin flow: crosshair pin, place/postcode search | 🔄 Crosshair + "use my location" done; postcode/place search is a visible stub (needs a geocoding API — defer to Milestone 2) |
| Nomination form UI: 8 questions, one per screen on mobile, progress bar | ✅ Incl. landowner follow-up and criteria scoring |
| Sign-up UI: email, optional name, two unticked consent checkboxes, "submit without email" link | ✅ Magic-link step simulated (no real email send yet — Milestone 2) |
| Wire prototype end-to-end (no real persistence required yet) | ✅ Zustand store, persisted to localStorage for continuity across test sessions |
| Test with 5–10 existing supporters on their phones; capture friction points | ⬜ |

### Milestone 2 — Core build

| Task | Status |
|---|---|
| Provision Supabase project; enable PostGIS | ⬜ |
| Create schema: `users`, `consents`, `nominations`, `landowner_leads`, `votes`, `status_history`, `moderation_reports` | ⬜ |
| Load ONS local authority boundaries; council-area lookup from lat/lng | ⬜ |
| Magic-link sign-in via Supabase Auth | ⬜ |
| Real map with live nominations, approximate (snapped) public markers | ⬜ |
| Nomination submit → pending record → confirmed on magic-link click | ⬜ |
| Duplicate-pin detection (200m) → offer as vote | ⬜ |
| Vote flow: verified-email-only, one vote per user per nomination, price band | ⬜ |
| Consent recording: versioned wording + timestamp, never overwritten | ⬜ |
| Criteria scoring logic (per question 1–7, pass/fail flags) | ⬜ |
| Landowner follow-up fields + `landowner_leads` write | ⬜ |
| Anti-gaming: disposable-email blocklist, 50/day nomination cap | ⬜ |
| Automatic AI moderation check (offensive content, personal details, home/garden pins) on free text + new pins | ⬜ |
| Share flow: prefilled Facebook share, deep link opens map at site | ⬜ |
| "My spots" screen with status history | ⬜ |
| Cookieless analytics + campaign tagging on share/post links | ⬜ |

### Milestone 3 — Admin and reporting

| Task | Status |
|---|---|
| Password-protected admin view (desktop-first) | ⬜ |
| Site list with filters (council area, status, score, flags, vote count) | ⬜ |
| Exact-location admin map view (satellite, landowner details inline) | ⬜ |
| Moderation queue (flagged free text + pins + reports) | ⬜ |
| Confirm Brevo plan includes the Deals (CRM) module; set up pipeline with public-safe + private stages | ⬜ |
| Auto-create a Brevo deal (linked to the nominator's contact) when a nomination passes initial moderation | ⬜ |
| Non-marketing Brevo contact path for landowner-only deals (separate list, no marketing consent, excluded from automations) | ⬜ |
| Supabase Edge Function: receive Brevo deal-stage webhook, map to public status enum, write `nominations.status` + `status_history` | ⬜ |
| Trigger the applicant status email only on public-safe stage changes | ⬜ |
| Brevo sync for opted-in supporters, consent-flag aware | ⬜ |
| Demand report generator (PDF + CSV), per site or per council area | ⬜ |
| Site finder integration: shared targets table / sync job, "Suggested by AireStop" markers, 200m merge matching, combined priority score | ⬜ |

### Milestone 4 — Soft launch

| Task | Status |
|---|---|
| Final QA pass on mobile (primary device target) | ⬜ |
| Publish one Facebook post to existing AireStop audience | ⬜ |
| Monitor funnel (click → sign-up → nomination/vote) for 48h; fix blockers | ⬜ |
| Wider promotion once friction points are resolved | ⬜ |

### Milestone 5 — Review at eight weeks

| Task | Status |
|---|---|
| Pull metrics against `docs/PROJECT_PLAN.md` success metrics table | ⬜ |
| Decide v2 priorities (photos is the leading candidate once moderation capacity is clear) | ⬜ |
