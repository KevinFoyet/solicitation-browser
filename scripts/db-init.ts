// One-time database bootstrap that Drizzle Kit cannot express: extensions.
// Run via `npm run db:init` (loads .env, uses the direct/unpooled URL).
import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is not set');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
	await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
	const { rows } = await client.query<{ extname: string; extversion: string }>(
		"SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm'"
	);
	console.log(`pg_trgm ready (version ${rows[0]?.extversion})`);
} finally {
	await client.end();
}
