import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

// Long-lived adapter-node process → TCP driver (node-postgres) with a client-side pool,
// pointed at Neon's pooled endpoint (-pooler). Drizzle Kit uses the direct URL instead.
export const pool = new pg.Pool({
	connectionString: DATABASE_URL,
	max: 10,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 10_000
});

export const db = drizzle(pool, { schema });

export { schema };
