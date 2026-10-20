# Solicitation Browser

A fast, focused browser for DLA DIBBS Requests for Quotation (RFQs). A background job pulls the
daily solicitations from [dibbs.bsm.dla.mil](https://www.dibbs.bsm.dla.mil/RFQ/) into Postgres;
the UI lets a small parts vendor scan ~1,000–2,000 new RFQs a day, search and filter them down to
the ones worth quoting, and jump back to DIBBS to quote. **The UI never calls DIBBS live.**

**Stack:** SvelteKit 3 + TypeScript · Postgres on [Neon](https://neon.tech) via Drizzle ORM ·
`node:https` + Cheerio for scraping · one repo, one process (`adapter-node`) · Tailwind · vitest.

## Quick start

```sh
npm install
cp .env.example .env          # or: `neon link` / `neon deploy` to pull a Neon DATABASE_URL
npm run db:init               # CREATE EXTENSION pg_trgm (direct connection)
npm run db:push               # create tables + indexes from src/lib/server/db/schema.ts
npm run scrape -- --days 7    # backfill: 7 daily index files + today's & yesterday's listing (~45 s)
npm run dev                   # http://localhost:5173
```

Without Neon, `npm run db:start` boots a local Postgres in Docker that matches `.env.example`.
On an empty database the server also backfills itself on first boot (`SCRAPE_ON_BOOT=0` disables).

Production build: `npm run build && npm start` (reads `.env` at runtime; nothing is inlined).

## How data gets in

DIBBS is an ASP.NET WebForms site behind an F5 WAF with no API. Two sources feed one table:

| Source                                                            | What it gives                                                                                                                                                                       | When                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Listing page** `RfqRecs.aspx?category=issue&Value=M-D-Y`        | Today's RFQs: NSN, nomenclature, solicitation, PR + qty, status (Open/Removed), set-aside icon, tech docs, PDF + Package View links. 50 rows/page, paging = `__doPostBack(Page$N)`. | Live, appended through the business day (~23–25 pages).                             |
| **Daily index file** `dibbs2…/Downloads/RFQ/Archive/inYYMMDD.txt` | Fixed-width, one line per RFQ: unit of issue, buyer code, AMSC, set-aside **code**, item type. 1 request/day.                                                                       | Published the **next** day ("files for the current date are posted one day later"). |

Mechanics worth knowing (all in `src/lib/server/dibbs/`):

- **DoD consent banner.** Every host (`www.dibbs…`, `dibbs2…`) redirects first access to
  `dodwarning.aspx`; we POST its hidden WebForms fields + `butAgree=OK` and keep the per-host
  session cookies.
- **WAF quirks.** It rejects non-browser user agents, `Accept-Encoding: br`, and the
  `sec-fetch-mode: cors` header that Node's `fetch` force-adds to every request — so the transport
  is plain `node:https` with explicit headers and manual redirects.
- **Politeness.** Sequential requests, 300 ms spacing, retries with backoff, one crawl per run.
- **Idempotent upsert** on `(solicitation, nsn, purchase_request)`. The listing wins for status
  (Open → Removed updates in place); the index file fills unit/buyer/AMSC/set-aside; empty values
  never overwrite known ones. Both sources are normalized to one canonical item id (`8475-01-389-6117`,
  DLA's alphanumeric `5330-LL-SZW-A481`, or a raw part number) so they land on the same row.
- **Cadence.** Hourly 07:00–19:00 ET on weekdays we re-read today's listing; nightly we ingest
  yesterday's authoritative index file and re-read its listing. **Refresh** in the header runs the
  same job on demand; `scrape_runs` records every run so the UI can show "synced 12:16 PM" — or a
  yellow banner with the error while still serving the last good data.

## Filters — and why

| Filter                                                                         | The vendor's question                | Why it earns its place                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **FSC** (NSN digits 1–4), multi-select with counts                             | Is this a category I sell?           | Vendors live in a handful of FSCs; this cuts 1,000 rows to dozens. Defaulted from the profile.  |
| **Search** NSN / nomenclature / solicitation / PR                              | Is this a specific part I know?      | Buyers reference NSNs and solicitation numbers; search accepts dashes or not (trigram indexes). |
| **Watchlist** (profile NSNs)                                                   | Have I quoted or won this before?    | Highest-probability wins.                                                                       |
| **Set-aside**                                                                  | Am I eligible to bid?                | Hard eligibility gate — 12 % of RFQs are set aside (SB, HUBZone, SDVOSB, WOSB).                 |
| **Return-by ≤ 3 / 7 / 14 / 30 days**, hide expired                             | Can I make the deadline?             | Drives today's work order; expired rows are noise. Red ≤ 3 days, amber ≤ 7.                     |
| **Quantity min / max**                                                         | Is it worth the paperwork?           | QTY 1 vs 1,500 is a different business decision.                                                |
| **Tech docs required**                                                         | Is there drawing / spec work?        | Changes effort and lead time.                                                                   |
| **Solicitation type** T / Q / U                                                | Automated small buy or a manual RFQ? | 90 % are automated `-T-` buys evaluated by machine — a different sales motion than a `-Q-` RFQ. |
| **Issuing office**                                                             | Which DLA buying activity?           | Vendors know which supply chains (Aviation, Land, Maritime, Medical, C&T) they sell to.         |
| **Status** open / removed / all                                                | Still live?                          | Default open; removed shown only on request.                                                    |
| **Triage** ★ interested / ✕ passed / ✓ quoted, notes · **NEW** since last sync | Have I already looked at this?       | Memory is the biggest time saver DIBBS lacks: reviewed rows drop out of the default view.       |

**Default landing view** = your profile applied (when one exists) · open · not expired · unreviewed
· newest first. Every filter lives in the URL, so a view is a bookmark.

Every row links out in a new tab: **DIBBS ↗** (Package View), **PDF ↗** (the solicitation), and from
the drawer **Quote on DIBBS ↗** (needs the vendor's DIBBS login — we route to DIBBS, never replace it).
Keyboard: `j`/`k` move · `Enter` details · `o` open DIBBS · `i` interested · `x` pass · `/` search ·
`r` refresh · `Esc` close.

## Design decisions

1. **Scrape → store → query; never proxy DIBBS live.** Instant UI (indexed SQL, ~50–100 ms),
   polite to a slow .mil site, and the app keeps working when DIBBS is down.
2. **Two ingestion paths.** The listing for freshness, the index file as the cheap authoritative
   daily copy — and each fills gaps in the other (status vs. unit/AMSC/codes).
3. **Derived columns at ingest** (`fsc`, `issuing_office`, `sol_type`, `set_aside_code`) so they
   are indexable, not recomputed per query.
4. **Server-side filtering + pagination in SQL**; facet counts are computed with every other filter
   applied, so the sidebar always shows reachable options.
5. **`scrape_runs` makes freshness and failure visible** instead of a blank page.
6. **Postgres on Neon:** pooled endpoint (`DATABASE_URL`) for the app's `pg` pool, direct endpoint
   (`DATABASE_URL_UNPOOLED`) for Drizzle Kit and `pg_trgm`. `neon.ts` declares the branch policy.
7. **No LLM in the critical path** — the data is already structured.
8. **One repo, one process.** Splitting the scraper into a worker/queue is the stated next step.

## Project layout

```
src/lib/server/dibbs/     session.ts (consent, cookies, WAF-safe transport) · listing.ts (grid + postbacks)
                          indexFile.ts (fixed width) · normalize.ts · parsers.spec.ts (fixture tests)
src/lib/server/ingest/    run.ts (mutex, scrape_runs, batched upsert) · scheduler.ts (boot + cron)
src/lib/server/queries/   rfqs.ts (WHERE builder, facets, triage join, profile) · page.ts · status.ts
src/lib/filters.ts        URL ⇄ Filters (shared)        src/lib/components/   Header · FilterSidebar · RfqTable · RfqDrawer · ProfileDialog
src/routes/api/           rfqs · refresh · triage · profile · health
scripts/                  scrape.ts (CLI) · db-init.ts     fixtures/   one real listing page + one real index file
```

## Scripts

| Script                       | What it does                                                     |
| ---------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                | Vite dev server (arms the scheduler; `SCRAPE_ON_BOOT=0` to skip) |
| `npm run build` / `start`    | adapter-node build, then `node build`                            |
| `npm run scrape -- --days 7` | CLI ingestion; also `--date YYYY-MM-DD`, `--index YYYY-MM-DD`    |
| `npm run check` / `lint`     | svelte-check · prettier + eslint                                 |
| `npm test`                   | vitest: parsers against real DIBBS fixtures                      |
| `npm run db:init` / `push`   | enable `pg_trgm` · sync schema (uses the unpooled URL)           |

## Environment

| Variable                | Used by                | Notes                                 |
| ----------------------- | ---------------------- | ------------------------------------- |
| `DATABASE_URL`          | the app (`pg` pool)    | Neon **pooled** endpoint (`-pooler`)  |
| `DATABASE_URL_UNPOOLED` | `db:init`, Drizzle Kit | Neon **direct** endpoint for DDL      |
| `SCRAPE_ON_BOOT`        | server start           | `0` disables the boot backfill + cron |

`.env` is git-ignored; `neon deploy` writes these values for the linked branch (`neon.ts`).

## Known limitations

- Today's RFQs come only from the listing page (the index file lands the next day); the status of
  older rows is refreshed only when their listing is re-read (nightly for yesterday).
- Set-aside on the listing page is parsed from the icon's alt text (best effort); the index file's
  explicit code overrides it the next day.
- PDF links for index-file rows are constructed from the observed `…/RFQ/<last digit>/<sol>.PDF`
  pattern; the listing's real href replaces them when seen.
- Single vendor profile, no accounts; triage is shared by everyone using the instance.

## What I'd do next

Worker + queue for ingestion and multi-user auth · saved views with email/Slack alerts · award
history per NSN from the DIBBS Awards pages (price-to-win) · AMSC decoding as an eligibility
filter · LLM extraction of PDF terms (packaging, delivery days, inspection) · relevance scoring from
past quotes · deploy (Vercel + Neon) for a live link.
