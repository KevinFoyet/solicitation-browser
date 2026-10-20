import { getStatus } from '#lib/server/queries/status.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const status = await getStatus();
	return { totals: status.totals, lastRun: status.lastRun };
};
