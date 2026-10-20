import { parseFilters } from '#lib/filters.js';
import { facets, getProfile, getRuns, listRfqs, profileIsEmpty } from './rfqs.js';
import { getStatus } from './status.js';

/** Everything the one page (and `GET /api/rfqs`) needs, from a URL's search params. */
export async function loadPage(sp: URLSearchParams) {
	const [profile, runs] = await Promise.all([getProfile(), getRuns()]);
	const mineDefault = !profileIsEmpty(profile);
	const filters = parseFilters(sp, mineDefault);
	const ctx = { profile, lastOkRunStartedAt: runs.newSince };
	const [list, facetCounts, status] = await Promise.all([
		listRfqs(filters, ctx),
		facets(filters, ctx),
		getStatus()
	]);
	return {
		filters,
		mineDefault,
		rows: list.rows,
		total: list.total,
		facets: facetCounts,
		profile,
		runs: { latest: runs.latest, lastOk: runs.lastOk },
		totals: status.totals
	};
}

export type PageData = Awaited<ReturnType<typeof loadPage>>;
