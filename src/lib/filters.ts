/** Shared (client + server): every filter lives in the URL so views are bookmarkable. */

export const STATUSES = ['open', 'removed', 'all'] as const;
export const DUES = ['3', '7', '14', '30', 'all'] as const;
export const TECH_DOCS = ['all', 'yes', 'no'] as const;
export const STATES = ['unreviewed', 'interested', 'passed', 'quoted', 'all'] as const;
export const SORTS = ['issued_desc', 'due_asc', 'qty_desc', 'nsn_asc', 'sol_asc'] as const;

export type Status = (typeof STATUSES)[number];
export type Due = (typeof DUES)[number];
export type TechDocs = (typeof TECH_DOCS)[number];
export type TriageState = (typeof STATES)[number];
export type Sort = (typeof SORTS)[number];

export interface Filters {
	q: string;
	fsc: string[];
	office: string[];
	setAside: string[]; // Y H R L A E N | unknown
	solType: string[]; // T Q U
	status: Status;
	due: Due;
	qtyMin: number | null;
	qtyMax: number | null;
	techDocs: TechDocs;
	issuedFrom: string | null;
	issuedTo: string | null;
	state: TriageState;
	mine: boolean;
	newOnly: boolean;
	sort: Sort;
	page: number;
	pageSize: number;
}

export const DEFAULTS: Filters = {
	q: '',
	fsc: [],
	office: [],
	setAside: [],
	solType: [],
	status: 'open',
	due: 'all',
	qtyMin: null,
	qtyMax: null,
	techDocs: 'all',
	issuedFrom: null,
	issuedTo: null,
	state: 'unreviewed',
	mine: false,
	newOnly: false,
	sort: 'issued_desc',
	page: 1,
	pageSize: 50
};

export const SORT_LABELS: Record<Sort, string> = {
	issued_desc: 'Newest first',
	due_asc: 'Closing soonest',
	qty_desc: 'Largest quantity',
	nsn_asc: 'NSN',
	sol_asc: 'Solicitation'
};

const oneOf = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
	v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const int = (v: string | null): number | null => {
	if (v == null || v === '') return null;
	const n = Number(v);
	return Number.isInteger(n) && n >= 0 ? n : null;
};
const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const list = (sp: URLSearchParams, key: string) => [
	...new Set(
		sp
			.getAll(key)
			.flatMap((v) => v.split(','))
			.map((v) => v.trim())
			.filter(Boolean)
	)
];

/** `mineDefault` = true when a vendor profile exists, so the landing view is "mine". */
export function parseFilters(sp: URLSearchParams, mineDefault = false): Filters {
	const pageSize = Math.min(200, Math.max(10, int(sp.get('page_size')) ?? DEFAULTS.pageSize));
	return {
		q: (sp.get('q') ?? '').trim(),
		fsc: list(sp, 'fsc'),
		office: list(sp, 'office'),
		setAside: list(sp, 'set_aside'),
		solType: list(sp, 'sol_type'),
		status: oneOf(sp.get('status'), STATUSES, DEFAULTS.status),
		due: oneOf(sp.get('due'), DUES, DEFAULTS.due),
		qtyMin: int(sp.get('qty_min')),
		qtyMax: int(sp.get('qty_max')),
		techDocs: oneOf(sp.get('tech_docs'), TECH_DOCS, DEFAULTS.techDocs),
		issuedFrom: isoDate(sp.get('issued_from')),
		issuedTo: isoDate(sp.get('issued_to')),
		state: oneOf(sp.get('state'), STATES, DEFAULTS.state),
		mine: sp.has('mine') ? sp.get('mine') === '1' : mineDefault,
		newOnly: sp.get('new') === '1',
		sort: oneOf(sp.get('sort'), SORTS, DEFAULTS.sort),
		page: Math.max(1, int(sp.get('page')) ?? 1),
		pageSize
	};
}

/** Serialize only non-default values (keeps URLs short and shareable). */
export function toSearchParams(f: Filters, mineDefault = false): URLSearchParams {
	const sp = new URLSearchParams();
	if (f.q) sp.set('q', f.q);
	for (const v of f.fsc) sp.append('fsc', v);
	for (const v of f.office) sp.append('office', v);
	for (const v of f.setAside) sp.append('set_aside', v);
	for (const v of f.solType) sp.append('sol_type', v);
	if (f.status !== DEFAULTS.status) sp.set('status', f.status);
	if (f.due !== DEFAULTS.due) sp.set('due', f.due);
	if (f.qtyMin != null) sp.set('qty_min', String(f.qtyMin));
	if (f.qtyMax != null) sp.set('qty_max', String(f.qtyMax));
	if (f.techDocs !== DEFAULTS.techDocs) sp.set('tech_docs', f.techDocs);
	if (f.issuedFrom) sp.set('issued_from', f.issuedFrom);
	if (f.issuedTo) sp.set('issued_to', f.issuedTo);
	if (f.state !== DEFAULTS.state) sp.set('state', f.state);
	if (f.mine !== mineDefault) sp.set('mine', f.mine ? '1' : '0');
	if (f.newOnly) sp.set('new', '1');
	if (f.sort !== DEFAULTS.sort) sp.set('sort', f.sort);
	if (f.page > 1) sp.set('page', String(f.page));
	if (f.pageSize !== DEFAULTS.pageSize) sp.set('page_size', String(f.pageSize));
	return sp;
}

/** Human-readable chips for the active (non-default) filters. */
export function activeChips(f: Filters): { key: keyof Filters; value?: string; label: string }[] {
	const chips: { key: keyof Filters; value?: string; label: string }[] = [];
	if (f.q) chips.push({ key: 'q', label: `“${f.q}”` });
	for (const v of f.fsc) chips.push({ key: 'fsc', value: v, label: `FSC ${v}` });
	for (const v of f.office) chips.push({ key: 'office', value: v, label: `Office ${v}` });
	for (const v of f.setAside) chips.push({ key: 'setAside', value: v, label: `Set-aside ${v}` });
	for (const v of f.solType) chips.push({ key: 'solType', value: v, label: `Type ${v}` });
	if (f.status !== DEFAULTS.status) chips.push({ key: 'status', label: `Status: ${f.status}` });
	if (f.due !== DEFAULTS.due) chips.push({ key: 'due', label: `Due ≤ ${f.due} days` });
	if (f.qtyMin != null) chips.push({ key: 'qtyMin', label: `Qty ≥ ${f.qtyMin}` });
	if (f.qtyMax != null) chips.push({ key: 'qtyMax', label: `Qty ≤ ${f.qtyMax}` });
	if (f.techDocs !== DEFAULTS.techDocs)
		chips.push({ key: 'techDocs', label: `Tech docs: ${f.techDocs}` });
	if (f.issuedFrom) chips.push({ key: 'issuedFrom', label: `Issued from ${f.issuedFrom}` });
	if (f.issuedTo) chips.push({ key: 'issuedTo', label: `Issued to ${f.issuedTo}` });
	if (f.state !== DEFAULTS.state) chips.push({ key: 'state', label: `Triage: ${f.state}` });
	if (f.newOnly) chips.push({ key: 'newOnly', label: 'New since last sync' });
	return chips;
}
