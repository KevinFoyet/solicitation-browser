# Solicitation Browser

A fast, focused browser for DLA DIBBS Requests for Quotation (RFQs). A background job pulls the
daily solicitations from [dibbs.bsm.dla.mil](https://www.dibbs.bsm.dla.mil/RFQ/) into Postgres;
the UI lets a vendor scan, search, and filter them and jump back to DIBBS to quote.

**Stack:** SvelteKit + TypeScript · Postgres on [Neon](https://neon.tech) via Drizzle ORM ·
plain `fetch` + Cheerio for scraping · one repo, one process (`adapter-node`).

## Quick start

```sh
npm install
cp .env.example .env          # or: `neon link` / `neon deploy` to pull a Neon DATABASE_URL
npm run db:init               # CREATE EXTENSION pg_trgm (direct connection)
npm run db:push               # create tables + indexes from src/lib/server/db/schema.ts
npm run dev                   # http://localhost:5173
```

Without Neon, `npm run db:start` boots a local Postgres in Docker that matches `.env.example`.

Production build: `npm run build && npm start` (reads `.env` at runtime; nothing is inlined).

## Scripts

| Script                     | What it does                                           |
| -------------------------- | ------------------------------------------------------ |
| `npm run dev`              | Vite dev server                                        |
| `npm run build` / `start`  | adapter-node build, then `node build`                  |
| `npm run check` / `lint`   | svelte-check · prettier + eslint                       |
| `npm test`                 | vitest (parser unit tests)                             |
| `npm run db:init` / `push` | enable `pg_trgm` · sync schema (uses the unpooled URL) |

## Environment

| Variable                | Used by                | Notes                                |
| ----------------------- | ---------------------- | ------------------------------------ |
| `DATABASE_URL`          | the app (`pg` pool)    | Neon **pooled** endpoint (`-pooler`) |
| `DATABASE_URL_UNPOOLED` | `db:init`, Drizzle Kit | Neon **direct** endpoint for DDL     |

`.env` is git-ignored; `neon deploy` writes these values for the linked branch (`neon.ts`).
