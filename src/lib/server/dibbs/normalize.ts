import { WWW, DL } from './session.js';

export const compactSol = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** SPE1C127Q0088 → SPE1C1-27-Q-0088 (6-2-1-4). Unknown shapes are returned as-is. */
export const formatSol = (c: string) =>
	c.length === 13 ? `${c.slice(0, 6)}-${c.slice(6, 8)}-${c.slice(8, 9)}-${c.slice(9)}` : c;

export const officeOf = (sol: string) => sol.slice(0, 6);
export const solTypeOf = (sol: string) => (sol.length >= 9 ? sol[8] : null);

/**
 * Canonical item identifier shared by both DIBBS sources:
 * - real NSNs → dashed `8475-01-389-6117` (the listing sometimes appends notes like "Mil-Spec");
 * - DLA's alphanumeric 13-char stock numbers (`5330LLSZWA481`) → dashed the same way, FSC kept;
 * - anything else is a part number and is kept verbatim (no FSC).
 */
export function canonicalNsn(raw: string): {
	nsn: string;
	nsnDigits: string | null;
	fsc: string | null;
} {
	const trimmed = raw.replace(/\s+/g, ' ').trim();
	const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 9)}-${s.slice(9)}`;

	const numeric = /(?:^|\D)(\d{4})-?(\d{2})-?(\d{3})-?(\d{4})(?!\d)/.exec(trimmed);
	if (numeric) {
		const digits = numeric.slice(1).join('');
		return { nsn: dash(digits), nsnDigits: digits, fsc: digits.slice(0, 4) };
	}
	const alnum = /^(\d{4})-?([A-Z0-9]{2})-?([A-Z0-9]{3})-?([A-Z0-9]{4})(?:\s|$)/i.exec(trimmed);
	if (alnum) {
		const compact = alnum.slice(1).join('').toUpperCase();
		return { nsn: dash(compact), nsnDigits: null, fsc: compact.slice(0, 4) };
	}
	return { nsn: trimmed, nsnDigits: null, fsc: null };
}

/** MM-DD-YYYY (listing) or MM/DD/YY (index file) → YYYY-MM-DD. */
export function toIsoDate(s: string | null | undefined): string | null {
	if (!s) return null;
	const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(s.trim());
	if (!m) return null;
	const [, mm, dd, y] = m;
	const yyyy = y.length === 2 ? `20${y}` : y;
	return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

export const SET_ASIDE_LABELS: Record<string, string> = {
	Y: 'Small Business',
	H: 'HUBZone',
	R: 'SDVOSB',
	L: 'WOSB',
	A: '8(a)',
	E: 'EDWOSB',
	N: 'Unrestricted'
};

/** Map the listing page's icon alt text to an index-file style code (best effort). */
export function setAsideCodeFromLabel(label: string | null): string | null {
	if (!label) return null;
	const l = label.toLowerCase();
	if (/not set.?aside|unrestricted/.test(l)) return 'N';
	if (/economically/.test(l)) return 'E';
	if (/wom[ae]n/.test(l)) return 'L';
	if (/hubzone/.test(l)) return 'H';
	if (/veteran/.test(l)) return 'R';
	if (/8\s*\(?a\)?/.test(l)) return 'A';
	if (/small business/.test(l)) return 'Y';
	return null;
}

/** Display hints for DLA buying activities (first 5 chars of the solicitation). */
const OFFICE_LABELS: [prefix: string, label: string][] = [
	['SPE1C', 'Troop Support · Clothing & Textiles'],
	['SPE2D', 'Troop Support · Medical'],
	['SPE3S', 'Troop Support · Subsistence'],
	['SPE4A', 'Aviation'],
	['SPE5E', 'Troop Support · Industrial Hardware'],
	['SPE7L', 'Land & Maritime · Land'],
	['SPE7M', 'Land & Maritime · Maritime'],
	['SPE8E', 'Troop Support · Construction & Equipment']
];
export function officeLabel(office: string): string {
	const hit = OFFICE_LABELS.find(([p]) => office.startsWith(p));
	return hit ? `${office} · ${hit[1]}` : office;
}

export const SOL_TYPE_LABELS: Record<string, string> = {
	T: 'Automated (T)',
	Q: 'Manual RFQ (Q)',
	U: 'Other (U)'
};

export const packageViewUrl = (sol: string) => `${WWW}/rfq/rfqrec.aspx?sn=${sol}`;
export const quoteUrl = (sol: string) => `${WWW}/RA/Quote/QuoteFrm.aspx?sn=${sol}`;
export const nsnViewUrl = (nsnDigits: string) =>
	`${WWW}/RFQ/RFQNsn.aspx?value=${nsnDigits}&category=issue&Scope=`;
/** PDFs live in a folder named after the solicitation's last digit (observed on every row). */
export const pdfUrlFor = (sol: string, fileName?: string) =>
	`${DL}/Downloads/RFQ/${sol.slice(-1)}/${(fileName ?? `${sol}.pdf`).toUpperCase().replace(/\.PDF$/i, '.PDF')}`;
