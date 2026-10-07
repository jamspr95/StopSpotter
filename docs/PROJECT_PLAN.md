# StopSpotter — Project Plan

> Source: [StopSpotter MVP Design Spec](https://claude.ai/artifact/CA5foCYZaKJbr5QG6PV3wH) (Jamie Spratt, 2026-10-06).
> This plan translates that spec into phases, milestones and decisions. For the
> engineering task breakdown, see `docs/BUILD_PLAN.md`.

## Status Key

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |

---

## What StopSpotter is

StopSpotter is a mobile-first map where AireStop supporters nominate and vote
for potential aire stops across England, Wales and Scotland. The MVP has
three jobs:

1. Build a database of candidate stops on any land, public or private.
2. Produce demand evidence by council area.
3. Grow a consented supporter list.

**The problem it solves:** AireStop needs two things it can't easily buy —
good stop leads and proof that motorhomers want aires in specific places.
Councils often don't know what land they own, and supporters on social media
have no low-effort way to help beyond donating. StopSpotter turns supporters
into scouts; every nomination and vote becomes evidence for a conversation
with any landowner, from a council to a farmer.

It runs alongside AireStop's public-land site finder tool rather than
replacing it — see "Relationship to the site finder" below.

---

## Success metrics (8 weeks post-launch)

These are proposed starting points to validate, not commitments.

| Goal | Measure | Proposed target |
|---|---|---|
| Engagement | Facebook click → sign-up rate | 15% |
| Stop data | Nominations submitted | 300 |
| Stop quality | Nominations passing the basic criteria check | 50% |
| Demand evidence | Council areas with 25+ "I'd stay here" votes | 10 |
| Supporter list | Sign-ups opting in to marketing | 40% |
| Conversion | Opted-in users who become backers or supporters | 3% |

---

## Users

| User | What they want | MVP role |
|---|---|---|
| Supporter (motorhomer) | Back a place they'd love to stay; see others agree | Nominates, votes, shares, may back AireStop |
| Casual visitor | See what's been suggested near them | Browses without signing up |
| AireStop admin (Jamie) | Usable stop leads and demand evidence | Reviews, scores, moves stops through a pipeline, exports reports |
| Landowner (council, public body, business or private owner) | Proof of demand before committing land | Receives exported reports; no login in MVP |

## Design principles

1. **Look free, sign up to act.** Anyone can browse the map; email is asked for only at the first nomination or vote.
2. **Under 60 seconds to first contribution**, on a phone.
3. **Ask about the stop, not the person.** Every form question maps to a stop criterion; personal data stops at email.
4. **Protect stops before they're secured.** Exact locations stay private; the public sees approximate markers.
5. **Consent is separate and explicit.** Using the tool never depends on agreeing to marketing.
6. **Close the loop.** Contributors hear what happened to their nomination, which is also the route to support.

---

## Scope

### In scope for the MVP
- Public map with approximate markers and council-area heat view
- Nominate a stop (pin drop + 8-question form + optional landowner lead capture)
- Vote on an existing nomination ("I'd stay here" + price band)
- Magic-link sign-up with explicit, separable marketing/support consent
- Automatic moderation (AI content check) with a manual review queue for flagged items
- Anti-gaming controls (duplicate-to-vote, verified-email voting, rate caps, disposable-email blocking)
- Admin pipeline view (stop list, status, moderation queue) and council/landowner demand report (PDF/CSV)
- Integration with AireStop's existing site finder on one shared target list

### Out of scope for the MVP
Photos, comments and discussion, leaderboards or badges, a separate landowner
portal, in-app payments, and a native app. Photos are the strongest
candidate for version two, once moderation capacity is clear.

---

## Milestones

> Milestones follow the build sequence in the design spec. Each links to its
> detailed task list in `docs/BUILD_PLAN.md`.

### Milestone 0 — Foundation
> Goal: repo, stack decisions and shared data model in place before UI work starts.

| Task | Status |
|---|---|
| Create GitHub repo (`jamspr95/stopspotter`) | ✅ |
| Write project plan (this file) and build plan | ✅ |
| Confirm stack: Supabase (Postgres + PostGIS + magic-link auth), MapLibre/Leaflet, Brevo, cookieless analytics | ✅ |
| Provision Supabase project (dev) | ⬜ |
| Load ONS local authority boundaries for council-area lookup | ⬜ |

### Milestone 1 — Clickable prototype
> Goal: map, pin, form and sign-up flow, tested with 5–10 existing supporters on their phones.

| Task | Status |
|---|---|
| See `docs/BUILD_PLAN.md` § Milestone 1 for engineering tasks | 🔄 App built and click-tested end-to-end; postcode search still a stub |
| Run informal usability pass with 5–10 supporters | ⬜ |

### Milestone 2 — Core build
> Goal: real map, nominations, votes, magic-link sign-in, consent records, approximate markers.

| Task | Status |
|---|---|
| See `docs/BUILD_PLAN.md` § Milestone 2 | 🔄 Schema, data layer and auth code all built and locally verified; needs a real Supabase project provisioned (`docs/SETUP.md`) before it's live. Disposable-email blocklist and automatic AI moderation still open. |

### Milestone 3 — Admin and reporting
> Goal: stop list, status pipeline, moderation queue, supporter export, council demand report.

| Task | Status |
|---|---|
| See `docs/BUILD_PLAN.md` § Milestone 3 | ⬜ |

### Milestone 4 — Soft launch
> Goal: one Facebook post to existing followers; fix friction before wider promotion.

| Task | Status |
|---|---|
| Publish soft-launch post to existing AireStop Facebook audience | ⬜ |
| Monitor funnel (click → sign-up → nomination/vote) for the first 48h and fix blockers | ⬜ |
| Wider promotion once friction points are addressed | ⬜ |

### Milestone 5 — Review at eight weeks
> Goal: check the MVP against the success metrics above and decide what's next (photos are the leading v2 candidate).

| Task | Status |
|---|---|
| Pull metrics against the targets table above | ⬜ |
| Decide v2 priorities (photos, landowner portal, etc.) | ⬜ |

---

## Relationship to the site finder

StopSpotter and AireStop's public-land site finder run on one shared list of
target stops, so every lead has a single record whichever tool found it:

1. **One shared targets table** — site finder candidates and StopSpotter nominations live together, tagged by source (`site finder`, `user`, or `both`).
2. **The site finder seeds the map** — candidates passing hard criteria (size, 20m from houses, slope) appear as "Suggested by AireStop" markers in a distinct style, released in small batches per area so they don't crowd out user pins.
3. **StopSpotter feeds the site finder** — every user pin runs through the site finder's automatic checks (size, distance to housing, slope, likely public ownership).
4. **Matches merge** — a user pin within 200m of a site finder candidate joins that record; a stop found by both is a stronger lead.
5. **One priority score** — ranks targets on stop fit, demand (verified votes and price bands) and whether the owner is known. The top of the list flows into the sales pipeline, which drives public status updates.

---

## Decisions log

| Topic | Decision |
|---|---|
| Name and domain | StopSpotter by AireStop, hosted on the AireStop domain |
| Moderation | Jamie has very limited time, so moderation is automatic by default; only flagged items are reviewed |
| Status updates | Synced automatically from the sales pipeline; anything not automated stays private |
| Email | Brevo for supporter marketing; Gmail for landowner outreach |
| Sales pipeline | **Brevo CRM (Deals module)** — reuses the existing Brevo account rather than adding a new tool. Deals carry the pipeline stages; Brevo is the system of record for status, and a webhook pushes stage changes into StopSpotter. Landowner-only deals get a non-marketing Brevo contact (separate list, excluded from all marketing automations); outreach still happens from Gmail, not Brevo email. |
| Site finder | Works in tandem with StopSpotter on one shared target list |
| Local voters | Not separated out — the aim is attracting visitor spend, and locals rarely use aires |
| Support screen phasing | At launch, no crowdfunder exists yet, so the Support screen's primary ask is "Spot a stop", not backing AireStop. Supporter tier/crowdfunder links come back once the crowdfunder launches — the screen keeps a "Coming soon" note in the meantime rather than a dead CTA. |
| Terminology: Stop, not Site | A nominated place is a **stop**, not a "site" — matches how motorhomers actually talk about aires. "Spot" stays a verb only (the act of finding/nominating — "spot a stop"), never a noun for the place itself. Applied throughout the app's UI text and routes (`/stop/:id`, `/my-stops`); "site finder" is unaffected, since that's the name of AireStop's separate land-finding tool, not this usage. |
| Sign-in: Google/Apple/Facebook SSO | Added alongside email magic-link, not instead of it — removes the earlier MVP exclusion of Facebook login. All three sign in through Supabase Auth (`signInWithOAuth`); buttons only appear once a real backend is configured (`docs/SETUP.md` §6) **and** `VITE_SSO_ENABLED=true` is set — added after a tester hit a broken button because no provider was actually configured yet. Each provider still needs its own external setup (Google ~10 min/free, Facebook needs Meta App Review before public use, Apple needs a $99/year Developer account) before it actually works end to end. |
| Public card location: area label vs council area | The public stop card shows a free, reverse-geocoded "Near \<town/village\>" label (`src/lib/geocode.ts`, OSM Nominatim, resolved once at nomination time), not the formal council/LPA area — a tester found the council-area placeholder ("to be confirmed…") confusing on a public card, and the real council area is only actually needed for admin-side LPA outreach anyway (`docs/SETUP.md` §7). The council area is still captured and still drives the admin dashboard; only the public card's display changed. |
| Admin authentication | A server-side `admins` table (checked by every admin RPC), not an `is_admin` column on `profiles` — that table already has a self-service update policy a user could otherwise use to grant themselves admin. Admin accounts sign in with email + password (reusing Supabase Auth) rather than a separate bespoke password scheme; creating one is a manual, one-time dashboard step (`docs/SETUP.md` §9). |
| Brevo deal auto-creation and supporter sync | Deliberately left unbuilt in Milestone 3, rather than guessed at — doing it blind would mean assuming Brevo's REST API request shape with no account to verify it against, which risked shipping confidently-wrong integration code. The webhook *receiving* a Brevo stage change was built instead, since that payload shape is StopSpotter's own contract to define, not something to guess at Brevo's end. |

## Open questions

- [ ] Confirm the Brevo plan/tier includes the Deals (CRM) module and enough API quota for stage-change webhooks.
- [ ] How many site finder suggestions to release per area at launch?
- [ ] What does the existing site finder tool actually expose to integrate against — its own API, a shared database, a periodic export? The Milestone 3 integration (shared targets table, "Suggested by AireStop" markers, 200m merge matching) is blocked on this, not just unstarted.
- [ ] Are the eight-week targets right for the size of the current Facebook audience?
- [ ] Legal review of consent wording, handling of landowner details, and the line between supporter and investment communications.
- [ ] Drop the orphaned `get_my_nominations_old_v1` / `admin_list_nominations_old_v1` Postgres functions (left behind by `0009_area_label.sql` — `DROP FUNCTION`/`DROP VIEW` were timing out against the live project on the day; the originals were renamed out of the way instead of dropped, and their `EXECUTE` grant was revoked so they're inert, just dead schema clutter). Try again once that command works normally against the project.
- [ ] Set up a custom SMTP sender + branded email templates in Supabase (`docs/SETUP.md` "A note on email sending") — testers are currently getting the magic-link email from Supabase's own generic sender, which reads as spam/untrustworthy rather than from AireStop/StopSpotter.
