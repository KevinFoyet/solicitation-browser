import cron from 'node-cron';
import { count } from 'drizzle-orm';
import type { Db } from '#lib/server/db/client.js';
import { rfqs } from '#lib/server/db/schema.js';
import { easternDate, startIngest } from './run.js';

const log = (msg: string) => console.log(`[ingest] ${msg}`);
const TZ = 'America/New_York';

/** Dates for a "catch up" run: today + yesterday live, plus the last N published index files. */
export function defaultRunDates(indexDays = 7) {
	return {
		listingDates: [easternDate(0), easternDate(1)],
		indexDates: Array.from({ length: indexDays }, (_, i) => easternDate(i + 1))
	};
}

/**
 * Called once from hooks.server.ts. Backfills on first boot (empty table) and keeps the data
 * fresh during DIBBS business hours. Guarded against Vite HMR re-registering the jobs.
 */
export function startScheduler(db: Db) {
	const g = globalThis as { __sbScheduler?: boolean };
	if (g.__sbScheduler) return;
	g.__sbScheduler = true;

	void (async () => {
		const [{ n }] = await db.select({ n: count() }).from(rfqs);
		if (n === 0) {
			log('empty database → initial backfill');
			startIngest(db, { trigger: 'boot', ...defaultRunDates(7), log });
		}
	})().catch((e) => log(`boot check failed: ${e instanceof Error ? e.message : e}`));

	// DIBBS appends RFQs through the business day → poll today's listing hourly, 07:00–19:00 ET.
	cron.schedule(
		'0 7-19 * * 1-5',
		() => startIngest(db, { trigger: 'cron', listingDates: [easternDate(0)], log }),
		{ timezone: TZ }
	);
	// Overnight: yesterday's authoritative index file + re-read its listing for Open → Removed.
	cron.schedule(
		'30 2 * * *',
		() =>
			startIngest(db, {
				trigger: 'cron',
				listingDates: [easternDate(1)],
				indexDates: [easternDate(1)],
				log
			}),
		{ timezone: TZ }
	);
	log('scheduler armed (hourly 07–19 ET weekdays, nightly 02:30 ET)');
}
