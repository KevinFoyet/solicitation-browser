import { error, json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { easternDate, isRunning, startIngest } from '#lib/server/ingest/run.js';
import { getRuns } from '#lib/server/queries/rfqs.js';
import type { RequestHandler } from './$types';

/** Latest run (the UI polls this every few seconds while a run is in progress). */
export const GET: RequestHandler = async () => {
	const { latest } = await getRuns();
	return json({ running: isRunning(), latest });
};

/** Kick off a run in the background: today's + yesterday's listing, yesterday's index file. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { dates?: string[]; indexDays?: number };
	const listingDates = body.dates?.length ? body.dates : [easternDate(0), easternDate(1)];
	const indexDates = Array.from({ length: body.indexDays ?? 1 }, (_, i) => easternDate(i + 1));
	const started = startIngest(db, {
		trigger: 'manual',
		listingDates,
		indexDates,
		log: (m) => console.log(`[ingest] ${m}`)
	});
	if (!started) error(409, 'A sync is already running');
	const { latest } = await getRuns();
	return json({ runId: latest?.id ?? null }, { status: 202 });
};
