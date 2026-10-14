# StopSpotter — Title boundary lookup: on-demand plan

> Replaces the bulk-load design in `0015_title_boundaries.sql`. That design
> (download the entire national INSPIRE/RoS dataset into a Postgres table,
> on a monthly/quarterly schedule) is what filled the original project's
> disk and triggered the outage that led to the `StopSpotter_v1.1` rebuild —
> see the session history for the incident. This plan replaces it with a
> per-nomination, on-demand lookup that never stores national title data in
> Postgres at all.

## Status Key

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |

---

## Why the old design failed, in one line

A title lookup only ever needs "is there a registered title at this one
point?" — but the old design answered that by loading *every* title in the
country into a database table, so the storage cost scaled with the size of
Great Britain, not with the number of nominations StopSpotter actually has
(6, at time of writing). This plan makes storage scale with nominations
instead.

## Data source — unchanged, still free

Same two free, open-licensed bulk sources already in use:
- **England & Wales**: HM Land Registry INSPIRE Index Polygons.
- **Scotland**: Registers of Scotland Cadastral Parcels (open data feed).

Confirmed earlier this session: neither registry offers a free, public,
per-point API (HMLR's free `MapSearch` is human-portal-only; Scotland's
ScotLIS API needs a title number as input, not a coordinate, and costs
£3+VAT per lookup on the public side). So the bulk files are still the only
free route to the data — this plan changes *where that data lives and how
it's queried*, not where it comes from.

## Architecture

```
┌─────────────────────┐   ┌──────────────────────────┐   ┌───────────────────────┐
│ Bulk download        │   │ GitHub Release             │   │ Supabase Edge         │
│ (same HMLR/RoS        │──▶│ "title-tiles-latest"      │◀──│ Function              │
│ sources as today)     │   │ <nation>_<cell-id>.json   │   │ lookup-title-boundary  │
│ — build-time only,    │   │ asset per tile (small      │   │ — called per           │
│ run quarterly/manual, │   │ files, free, versioned     │   │   nomination, on       │
│ never touches Postgres│   │ hosting)                   │   │   demand               │
└─────────────────────┘   └──────────────────────────┘   └───────────────────────┘
                                                                     │
                                                                     ▼
                                                     nominations.title_number / .title_tenure
                                                     (one small result per nomination row)
```

**Correction from this plan's first draft**: tiles are published as
**GitHub Release assets**, not GitHub Pages files. Reason found while
implementing: `deploy.yml` already redeploys the *entire* Pages site from
`dist/` on every ordinary app-code push — any tile files sitting in that
same deployment would get wiped out by the very next unrelated push,
since Pages serves one full-replace artifact, not an incremental one.
Releases are independent of that workflow entirely, keep every past
tile-build as its own dated release if ever needed, and don't bloat the
git history the way committing the tiles into the repo would.

Postgres never holds more than one resolved title per nomination. The
national dataset lives as release assets, which cost nothing to store at
any size and nothing to query until a nomination actually needs resolving.

---

## Phase 0 — Build the tile dataset

**Moved to its own repo (Oct 2026):** [`jamspr95/stopspotter-title-tiles`](https://github.com/jamspr95/stopspotter-title-tiles)
— kept public (unlike this app repo, going private) so its GitHub Actions
minutes stay free and its release assets stay fetchable with a plain
unauthenticated `fetch()`, which `lookup-title-boundary` depends on. That
repo's own copy of this doc (`docs/TITLE_BOUNDARY_API_PLAN.md`) has the
full Phase 0 history — the grid design, the asset-count fix, and the
real OOM incident and its fix — unchanged by the move. Summary: build
scripts download HMLR/RoS bulk data, write gzipped NDJSON shard files,
and a quarterly GitHub Actions workflow publishes them as the
`title-tiles-latest` release this repo's edge function reads from. ✅
complete and live.

## Phase 1 — The lookup Edge Function

| Task | Status |
|---|---|
| `supabase/functions/lookup-title-boundary/index.ts` — takes `{lat, lng}`, computes the cell id, fetches that cell's two possible tile assets (`england_wales_<id>.json`, `scotland_<id>.json`) from the `title-tiles-latest` release, does a plain point-in-polygon test in memory (hand-rolled ray-casting, no new dependency), and returns `{titleNumber, tenure}`. Checks `current_user_is_admin()` itself (forwarding the caller's own JWT), same authorization pattern as every admin RPC | ✅ |
| Deployed to `StopSpotter_v1.1` via `mcp__Supabase__deploy_edge_function` | ✅ |

## Phase 2 — Wire it into the app

| Task | Status |
|---|---|
| Migration `0017_title_lookup_columns.sql`: `nominations.title_number`, `.title_tenure`, `.title_checked_at` — one resolved result per nomination | ✅ |
| Admin-only RPC `admin_set_nomination_title(p_nomination_id, p_title_number, p_title_tenure)` | ✅ |
| `AdminStopDetailScreen`'s `LookupTitleButton` — a manual "Look up title" action (`src/components/TitleBoundary.tsx`), calling `db.lookupNominationTitle()` → the Edge Function → the RPC above, via a new `useAdminStore.lookupNominationTitle` action | ✅ |
| `admin_list_nominations()` — drops the `LEFT JOIN LATERAL ... title_boundaries`, selects `title_number`/`title_tenure`/`title_checked_at` straight off the row | ✅ |
| `src/lib/priority.ts`'s `NO_KNOWN_OWNER_BOOST` — fixed to require `titleCheckedAt != null` as well as `titleNumber == null`; the on-demand design means most nominations start unchecked, so the old "titleNumber null = no known owner" proxy would have wrongly boosted every not-yet-looked-up nomination | ✅ |

## Phase 3 — Retire the old bulk system

| Task | Status |
|---|---|
| `public.title_boundaries` and `admin_title_boundary_coverage()` — `DROP TABLE`/`DROP FUNCTION` both timed out against this project (same "DROP times out here" characteristic this repo has hit before — 0009/0011/0014/0015; confirmed via `pg_stat_activity` showing nothing actually blocked). Same proven workaround used: renamed to `_retired` and `EXECUTE` revoked, left as inert dead schema rather than forcing a retry loop | ✅ |
| Delete `scripts/sync-title-boundaries-ew.mjs` / `-scotland.mjs`, `scripts/lib/titleBoundariesDb.mjs`, and `.github/workflows/sync-title-boundaries-{ew,scotland}.yml` — done as part of the Phase 0 repo split above: these were superseded dead code already, and the live replacements (now in `jamspr95/stopspotter-title-tiles`) don't need them either | ✅ |
| Update `docs/SETUP.md`'s title boundary section to describe this design instead of the bulk-load one | ✅ |
| Add a line to `docs/PROJECT_PLAN.md`'s decisions log recording *why* this changed (the disk-exhaustion incident, dated, with a link back to this file) | ⬜ |

---

## What this deliberately does not do

- **No automation of England/Wales or Scotland's own search portals** — both are consumer web UIs, not APIs; nothing here scrapes or automates them. The free MapSearch / paid ScotLIS portals remain fine fallbacks for a human doing a one-off manual check outside this system.
- **No new paid service** — everything here (GitHub Pages hosting, a Supabase Edge Function call) is already inside the stack and free at StopSpotter's current and foreseeable scale.
- **No attempt to recover the partial data already loaded into the old `title_boundaries` table** — that table only ever covered 24 of 351 areas before the outage, with no record of which, so it wasn't safe to trust anyway (see the coverage-tracking gap noted in `0016_title_boundary_coverage.sql`'s own limits). Starting clean with the tile-based design is simpler than trying to salvage it.
