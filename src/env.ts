import { defineEnvVars } from '@sveltejs/kit/env';

// Runtime (non-static) env: read from process.env when the server starts, never inlined
// into the build. See https://svelte.dev/docs/kit/environment-variables
export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Postgres connection string used by the app (Neon pooled endpoint).'
	}
});
