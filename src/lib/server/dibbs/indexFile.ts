import { DL, type DibbsSession, DibbsError } from './session.js';
import type { RfqRecord } from './types.js';
import {
	canonicalNsn,
	formatSol,
	officeOf,
	packageViewUrl,
	pdfUrlFor,
	SET_ASIDE_LABELS,
	solTypeOf,
	toIsoDate
} from './normalize.js';

/**
 * Daily "in" file: fixed-width index of every RFQ posted that day
 * (layout from https://www.dibbs.bsm.dla.mil/Rfq/RfqFileDefs.aspx). Published the next day.
 */
const LAYOUT: [key: string, width: number][] = [
	['sol', 13],
	['nsn', 46],
	['pr', 13],
	['returnBy', 8],
	['file', 19],
	['qty', 7],
	['ui', 2],
	['nomen', 21],
	['buyer', 5],
	['amsc', 1],
	['itemType', 1],
	['setAside', 1],
	['setAsidePct', 3]
];

export const indexFileUrl = (yymmdd: string) => `${DL}/Downloads/RFQ/Archive/in${yymmdd}.txt`;

/** 2026-10-19 → 261019 */
export const yymmddOf = (isoDate: string) => isoDate.replace(/-/g, '').slice(2);
/** 261019 → 2026-10-19 */
export const isoOfYymmdd = (yymmdd: string) =>
	`20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;

export function parseIndexLine(line: string, postedDate: string | null): RfqRecord | null {
	if (line.trim().length < 100) return null;
	const f: Record<string, string> = {};
	let o = 0;
	for (const [key, w] of LAYOUT) {
		f[key] = line.slice(o, o + w).trim();
		o += w;
	}
	if (!/^[A-Z0-9]{13}$/.test(f.sol)) return null;
	const { nsn, nsnDigits, fsc } = canonicalNsn(f.nsn);
	const qty = Number.parseInt(f.qty, 10);
	const itemType = f.itemType === '2' ? 2 : f.itemType === '1' ? 1 : null;
	return {
		solicitation: f.sol,
		solicitationFmt: formatSol(f.sol),
		nsn,
		nsnDigits,
		purchaseRequest: f.pr,
		nomenclature: f.nomen || null,
		quantity: Number.isFinite(qty) ? qty : null,
		unitOfIssue: f.ui || null,
		status: 'Open',
		setAsideCode: f.setAside in SET_ASIDE_LABELS ? f.setAside : null,
		setAsideLabel: SET_ASIDE_LABELS[f.setAside] ?? null,
		hasTechDocs: null,
		techDocsUrl: null,
		issuedDate: null,
		postedDate,
		returnBy: toIsoDate(f.returnBy),
		fsc: itemType === 2 ? null : fsc,
		issuingOffice: officeOf(f.sol),
		solType: solTypeOf(f.sol),
		buyerCode: f.buyer || null,
		amsc: f.amsc || null,
		itemType,
		dibbsUrl: packageViewUrl(f.sol),
		pdfUrl: pdfUrlFor(f.sol, f.file || undefined),
		source: 'index_file'
	};
}

export function parseIndexFile(text: string, postedDate: string | null): RfqRecord[] {
	const out: RfqRecord[] = [];
	for (const line of text.split(/\r?\n/)) {
		const rec = parseIndexLine(line, postedDate);
		if (rec) out.push(rec);
	}
	return out;
}

/** Returns [] when the file is not published yet (today's file appears tomorrow; DIBBS answers
 *  a missing file with either a 404 or an HTML page). */
export async function fetchIndexFile(session: DibbsSession, yymmdd: string): Promise<RfqRecord[]> {
	try {
		const text = await session.get(indexFileUrl(yymmdd));
		if (/<html|<!doctype/i.test(text.slice(0, 500))) return [];
		return parseIndexFile(text, isoOfYymmdd(yymmdd));
	} catch (e) {
		if (e instanceof DibbsError && /HTTP 404/.test(e.message)) return [];
		throw e;
	}
}
