import { json } from '@sveltejs/kit';
import { getStatus } from '#lib/server/queries/status.js';
import type { RequestHandler } from './$types';

/** Liveness + a real database round trip. 503 if Postgres is unreachable. */
export const GET: RequestHandler = async () => {
	const started = performance.now();
	try {
		const status = await getStatus();
		return json({
			ok: true,
			dbLatencyMs: Math.round(performance.now() - started),
			db: { now: status.db.now, version: status.db.version },
			totals: status.totals,
			lastRun: status.lastRun
		});
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
	}
};
