import { count, desc, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';

export type AppStatus = Awaited<ReturnType<typeof getStatus>>;

/** Freshness + volume summary for the header, plus the latest ingestion run. */
export async function getStatus() {
	const today = new Date().toISOString().slice(0, 10);
	const [[totals], [lastRun], dbInfo] = await Promise.all([
		db
			.select({
				total: count(),
				open: count(sql`CASE WHEN ${schema.rfqs.status} = 'Open' THEN 1 END`),
				today: count(sql`CASE WHEN ${schema.rfqs.issuedDate} = ${today} THEN 1 END`)
			})
			.from(schema.rfqs),
		db.select().from(schema.scrapeRuns).orderBy(desc(schema.scrapeRuns.startedAt)).limit(1),
		db.execute<{ now: string; version: string }>(sql`SELECT now()::text AS now, version()`)
	]);
	return { totals, lastRun: lastRun ?? null, db: dbInfo.rows[0] };
}
