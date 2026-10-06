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
for potential aire sites across England, Wales and Scotland. The MVP has
three jobs:

1. Build a database of candidate sites on any land, public or private.
2. Produce demand evidence by council area.
3. Grow a consented supporter list.

**The problem it solves:** AireStop needs two things it can't easily buy —
good site leads and proof that motorhomers want aires in specific places.
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
| Site data | Nominations submitted | 300 |
| Site quality | Nominations passing the basic criteria check | 50% |
| Demand evidence | Council areas with 25+ "I'd stay here" votes | 10 |
| Supporter list | Sign-ups opting in to marketing | 40% |
| Conversion | Opted-in users who become backers or supporters | 3% |

---

## Users

| User | What they want | MVP role |
|---|---|---|
| Supporter (motorhomer) | Back a place they'd love to stay; see others agree | Nominates, votes, shares, may back AireStop |
| Casual visitor | See what's been suggested near them | Browses without signing up |
| AireStop admin (Jamie) | Usable site leads and demand evidence | Reviews, scores, moves sites through a pipeline, exports reports |
| Landowner (council, public body, business or private owner) | Proof of demand before committing land | Receives exported reports; no login in MVP |

## Design principles

1. **Look free, sign up to act.** Anyone can browse the map; email is asked for only at the first nomination or vote.
2. **Under 60 seconds to first contribution**, on a phone.
3. **Ask about the site, not the person.** Every form question maps to a site criterion; personal data stops at email.
4. **Protect sites before they're secured.** Exact locations stay private; the public sees approximate markers.
5. **Consent is separate and explicit.** Using the tool never depends on agreeing to marketing.
6. **Close the loop.** Contributors hear what happened to their nomination, which is also the route to support.

---

## Scope

### In scope for the MVP
- Public map with approximate markers and council-area heat view
- Nominate a site (pin drop + 8-question form + optional landowner lead capture)
- Vote on an existing nomination ("I'd stay here" + price band)
- Magic-link sign-up with explicit, separable marketing/support consent
- Automatic moderation (AI content check) with a manual review queue for flagged items
- Anti-gaming controls (duplicate-to-vote, verified-email voting, rate caps, disposable-email blocking)
- Admin pipeline view (site list, status, moderation queue) and council/landowner demand report (PDF/CSV)
- Integration with AireStop's existing site finder on one shared target list

### Out of scope for the MVP
Photos, comments and discussion, leaderboards or badges, a separate landowner
portal, in-app payments, a native app, and Facebook login. Photos are the
strongest candidate for version two, once moderation capacity is clear.

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
| See `docs/BUILD_PLAN.md` § Milestone 1 for engineering tasks | ⬜ |
| Run informal usability pass with 5–10 supporters | ⬜ |

### Milestone 2 — Core build
> Goal: real map, nominations, votes, magic-link sign-in, consent records, approximate markers.

| Task | Status |
|---|---|
| See `docs/BUILD_PLAN.md` § Milestone 2 | ⬜ |

### Milestone 3 — Admin and reporting
> Goal: site list, status pipeline, moderation queue, supporter export, council demand report.

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
target sites, so every lead has a single record whichever tool found it:

1. **One shared targets table** — site finder candidates and StopSpotter nominations live together, tagged by source (`site finder`, `user`, or `both`).
2. **The site finder seeds the map** — candidates passing hard criteria (size, 20m from houses, slope) appear as "Suggested by AireStop" markers in a distinct style, released in small batches per area so they don't crowd out user pins.
3. **StopSpotter feeds the site finder** — every user pin runs through the site finder's automatic checks (size, distance to housing, slope, likely public ownership).
4. **Matches merge** — a user pin within 200m of a site finder candidate joins that record; a site found by both is a stronger lead.
5. **One priority score** — ranks targets on site fit, demand (verified votes and price bands) and whether the owner is known. The top of the list flows into the sales pipeline, which drives public status updates.

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

## Open questions

- [ ] Confirm the Brevo plan/tier includes the Deals (CRM) module and enough API quota for stage-change webhooks.
- [ ] How many site finder suggestions to release per area at launch?
- [ ] Are the eight-week targets right for the size of the current Facebook audience?
- [ ] Legal review of consent wording, handling of landowner details, and the line between supporter and investment communications.
