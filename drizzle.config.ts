import { defineConfig } from 'drizzle-kit';

// Schema changes must go over Neon's direct (non-pooled) endpoint; PgBouncer in transaction
// mode breaks migration tooling. Fall back to DATABASE_URL for a plain local Postgres.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url },
	verbose: true,
	strict: true
});
