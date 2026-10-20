import { json } from '@sveltejs/kit';
import { loadPage } from '#lib/server/queries/page.js';
import type { RequestHandler } from './$types';

/** Same filters as the page, as JSON — handy for curl, demos, and integrations. */
export const GET: RequestHandler = async ({ url }) => {
	const data = await loadPage(url.searchParams);
	return json({ filters: data.filters, total: data.total, rows: data.rows, facets: data.facets });
};
