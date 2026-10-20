import { loadPage } from '#lib/server/queries/page.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadPage(url.searchParams);
