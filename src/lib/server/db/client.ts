import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/**
 * Long-lived adapter-node process → TCP driver (node-postgres) with a client-side pool,
 * pointed at Neon's pooled endpoint (-pooler). Drizzle Kit uses the direct URL instead.
 * Shared by the app (`index.ts`, env from SvelteKit) and CLI scripts (env from process.env).
 */
export function createDb(connectionString: string): { db: Db; pool: pg.Pool } {
	const pool = new pg.Pool({
		connectionString,
		max: 10,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 10_000
	});
	return { db: drizzle(pool, { schema }), pool };
}
