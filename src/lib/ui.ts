/** Presentation helpers shared by the components (client-safe, no server imports). */

export const SET_ASIDE_SHORT: Record<string, string> = {
	Y: 'SB',
	H: 'HUBZ',
	R: 'SDVOSB',
	L: 'WOSB',
	A: '8(a)',
	E: 'EDWOSB',
	N: 'Unrestricted'
};

export const SET_ASIDE_LONG: Record<string, string> = {
	Y: 'Small Business set-aside',
	H: 'HUBZone set-aside',
	R: 'Service-Disabled Veteran-Owned SB set-aside',
	L: 'Woman-Owned SB set-aside',
	A: '8(a) set-aside',
	E: 'Economically Disadvantaged WOSB set-aside',
	N: 'Unrestricted / not set aside',
	unknown: 'Set-aside unknown'
};

export const SOL_TYPE_LONG: Record<string, string> = {
	T: 'Automated (T) — small-dollar, auto-evaluated',
	Q: 'Manual RFQ (Q)',
	U: 'Other (U)'
};

const OFFICE_HINTS: [string, string][] = [
	['SPE1C', 'Clothing & Textiles'],
	['SPE2D', 'Medical'],
	['SPE3S', 'Subsistence'],
	['SPE4A', 'Aviation'],
	['SPE5E', 'Industrial Hardware'],
	['SPE7L', 'Land'],
	['SPE7M', 'Maritime'],
	['SPE8E', 'Construction & Equipment']
];
export const officeHint = (office: string | null | undefined) =>
	(office && OFFICE_HINTS.find(([p]) => office.startsWith(p))?.[1]) || '';

export const fmtInt = new Intl.NumberFormat('en-US');

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	const [y, m, d] = iso.split('-');
	return `${m}/${d}/${y.slice(2)}`;
}

export function fmtTime(d: Date | string | null | undefined): string {
	if (!d) return '';
	return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Tailwind classes for the days-left badge: red ≤3, amber ≤7, grey otherwise. */
export function dueTone(daysLeft: number | null): string {
	if (daysLeft === null) return 'bg-gray-100 text-gray-500';
	if (daysLeft < 0) return 'bg-gray-100 text-gray-400 line-through';
	if (daysLeft <= 3) return 'bg-red-100 text-red-700';
	if (daysLeft <= 7) return 'bg-amber-100 text-amber-800';
	return 'bg-gray-100 text-gray-600';
}

export function dueLabel(daysLeft: number | null): string {
	if (daysLeft === null) return '—';
	if (daysLeft < 0) return 'expired';
	if (daysLeft === 0) return 'today';
	return `${daysLeft}d`;
}
