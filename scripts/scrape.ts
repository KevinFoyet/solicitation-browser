/**
 * CLI ingestion, e.g.
 *   npm run scrape -- --days 7              # index files for the last 7 days + today's & yesterday's listing
 *   npm run scrape -- --date 2026-10-20     # one issue date from the listing page
 *   npm run scrape -- --index 2026-10-19    # one daily index file
 */
import { createDb } from '../src/lib/server/db/client.js';
import { startIngest, easternDate } from '../src/lib/server/ingest/run.js';
import { defaultRunDates } from '../src/lib/server/ingest/scheduler.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (run via `npm run scrape`, which loads .env)');

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? (args[i + 1] ?? '') : undefined;
};

const dates = (() => {
	const days = flag('days');
	if (days !== undefined) return defaultRunDates(Number(days) || 7);
	const listingDates = flag('date') ? [flag('date') as string] : [];
	const indexDates = flag('index') ? [flag('index') as string] : [];
	return listingDates.length || indexDates.length
		? { listingDates, indexDates }
		: { listingDates: [easternDate(0)], indexDates: [easternDate(1)] };
})();

const { db, pool } = createDb(url);
const started = Date.now();
const run = await startIngest(db, { trigger: 'cli', ...dates, log: (m) => console.log(m) });
console.log(
	run
		? { ...run, seconds: Math.round((Date.now() - started) / 1000) }
		: 'another run is in progress'
);
await pool.end();
process.exitCode = run?.status === 'ok' ? 0 : 1;
