import { eq, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/client.js';
import { rfqs, scrapeRuns, type ScrapeRun } from '#lib/server/db/schema.js';
import { DibbsSession } from '#lib/server/dibbs/session.js';
import { fetchIssueDate } from '#lib/server/dibbs/listing.js';
import { fetchIndexFile, yymmddOf } from '#lib/server/dibbs/indexFile.js';
import type { RfqRecord } from '#lib/server/dibbs/types.js';

export type Trigger = 'boot' | 'manual' | 'cron' | 'cli';

export interface IngestOptions {
	trigger: Trigger;
	/** Issue dates to scrape from the listing page, as YYYY-MM-DD. */
	listingDates?: string[];
	/** Post dates whose daily index file to ingest, as YYYY-MM-DD. */
	indexDates?: string[];
	log?: (msg: string) => void;
}

const BATCH = 200;
let running: Promise<ScrapeRun> | null = null;

export const isRunning = () => running !== null;

/** Only one ingestion at a time per process; callers get a 409 when busy. */
export function startIngest(db: Db, opts: IngestOptions): Promise<ScrapeRun> | null {
	if (running) return null;
	running = ingest(db, opts).finally(() => (running = null));
	return running;
}

/** YYYY-MM-DD for `offset` days before today, in US Eastern time (DIBBS's clock). */
export function easternDate(offset = 0): string {
	const now = new Date(Date.now() - offset * 86_400_000);
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now); // en-CA → YYYY-MM-DD
}

export const toMmDdYyyy = (iso: string) =>
	`${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;

async function ingest(db: Db, opts: IngestOptions): Promise<ScrapeRun> {
	const log = opts.log ?? (() => {});
	const listingDates = opts.listingDates ?? [];
	const indexDates = opts.indexDates ?? [];
	const source =
		listingDates.length && indexDates.length
			? 'listing+index_file'
			: listingDates.length
				? 'listing'
				: 'index_file';

	const [run] = await db
		.insert(scrapeRuns)
		.values({
			status: 'running',
			trigger: opts.trigger,
			source,
			datesCovered: [...listingDates, ...indexDates]
		})
		.returning();
	const counters = { pagesFetched: 0, rowsParsed: 0, rowsUpserted: 0 };
	const flush = () => db.update(scrapeRuns).set(counters).where(eq(scrapeRuns.id, run.id));

	const session = new DibbsSession({ log });
	const errors: string[] = [];
	const attempt = async (label: string, work: () => Promise<void>) => {
		try {
			await work();
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			errors.push(`${label}: ${message}`);
			log(`  FAILED ${label}: ${message}`);
		}
	};

	for (const date of indexDates) {
		await attempt(`index ${date}`, async () => {
			log(`index file ${date}`);
			const records = await fetchIndexFile(session, yymmddOf(date));
			counters.pagesFetched++;
			counters.rowsParsed += records.length;
			counters.rowsUpserted += await upsertRecords(db, records);
			await flush();
			log(`  ${records.length} rows${records.length ? '' : ' (not published yet)'}`);
		});
	}
	for (const date of listingDates) {
		await attempt(`listing ${date}`, async () => {
			log(`listing ${date}`);
			await fetchIssueDate(session, toMmDdYyyy(date), {
				onPage: async (n, total, rows) => {
					counters.pagesFetched++;
					counters.rowsParsed += rows.length;
					counters.rowsUpserted += await upsertRecords(db, rows);
					await flush();
					log(`  page ${n}/${total}: ${rows.length} rows`);
				}
			});
		});
	}

	// Partial data is kept either way; the run is only "ok" when every date succeeded.
	const [done] = await db
		.update(scrapeRuns)
		.set({
			...counters,
			status: errors.length ? 'failed' : 'ok',
			finishedAt: new Date(),
			error: errors.length ? errors.join(' | ') : null
		})
		.where(eq(scrapeRuns.id, run.id))
		.returning();
	log(`done: ${done.status} (${counters.rowsUpserted} rows upserted)`);
	return done;
}

/**
 * Idempotent upsert on (solicitation, nsn, purchase_request). The listing page is authoritative
 * for status (Open → Removed); the index file fills unit/buyer/AMSC/set-aside codes. Empty
 * values never overwrite known ones.
 */
export async function upsertRecords(db: Db, records: RfqRecord[]): Promise<number> {
	// De-duplicate within the batch: Postgres rejects two conflicting rows in one INSERT.
	const byKey = new Map<string, RfqRecord>();
	for (const r of records) byKey.set(`${r.solicitation}|${r.nsn}|${r.purchaseRequest}`, r);
	const unique = [...byKey.values()];

	let n = 0;
	for (let i = 0; i < unique.length; i += BATCH) {
		const chunk = unique.slice(i, i + BATCH);
		await db
			.insert(rfqs)
			.values(chunk)
			.onConflictDoUpdate({
				target: [rfqs.solicitation, rfqs.nsn, rfqs.purchaseRequest],
				set: {
					status: sql`CASE WHEN excluded.source = 'listing' THEN excluded.status ELSE ${rfqs.status} END`,
					quantity: sql`COALESCE(excluded.quantity, ${rfqs.quantity})`,
					nomenclature: sql`COALESCE(NULLIF(excluded.nomenclature, ''), ${rfqs.nomenclature})`,
					unitOfIssue: sql`COALESCE(excluded.unit_of_issue, ${rfqs.unitOfIssue})`,
					setAsideCode: sql`COALESCE(excluded.set_aside_code, ${rfqs.setAsideCode})`,
					setAsideLabel: sql`COALESCE(excluded.set_aside_label, ${rfqs.setAsideLabel})`,
					hasTechDocs: sql`COALESCE(excluded.has_tech_docs, ${rfqs.hasTechDocs})`,
					techDocsUrl: sql`COALESCE(excluded.tech_docs_url, ${rfqs.techDocsUrl})`,
					issuedDate: sql`COALESCE(excluded.issued_date, ${rfqs.issuedDate})`,
					postedDate: sql`COALESCE(excluded.posted_date, ${rfqs.postedDate})`,
					returnBy: sql`COALESCE(excluded.return_by, ${rfqs.returnBy})`,
					buyerCode: sql`COALESCE(excluded.buyer_code, ${rfqs.buyerCode})`,
					amsc: sql`COALESCE(excluded.amsc, ${rfqs.amsc})`,
					fsc: sql`COALESCE(excluded.fsc, ${rfqs.fsc})`,
					pdfUrl: sql`COALESCE(excluded.pdf_url, ${rfqs.pdfUrl})`,
					source: sql`CASE WHEN excluded.source = 'listing' OR ${rfqs.source} = 'listing' THEN 'listing' ELSE excluded.source END`,
					lastSeenAt: sql`now()`
				}
			});
		n += chunk.length;
	}
	return n;
}
