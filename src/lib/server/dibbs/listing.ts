import * as cheerio from 'cheerio';
import { WWW, type DibbsSession, hiddenFields } from './session.js';
import type { RfqRecord } from './types.js';
import {
	canonicalNsn,
	compactSol,
	formatSol,
	officeOf,
	packageViewUrl,
	setAsideCodeFromLabel,
	solTypeOf,
	toIsoDate
} from './normalize.js';

/** "RFQs by issue date" grid: 50 rows per page, paging via WebForms postbacks. */
export const listingUrl = (mmddyyyy: string) =>
	`${WWW}/RFQ/RfqRecs.aspx?category=issue&TypeSrch=dt&Value=${mmddyyyy}`;

export const PAGE_SIZE = 50;
const GRID = 'ctl00$cph1$grdRfqSearch';

export interface ListingPage {
	records: RfqRecord[];
	recordsFound: number;
	hidden: Record<string, string>;
}

export function parseListingPage(html: string, issuedDate: string | null): ListingPage {
	const $ = cheerio.load(html);
	const recordsFound = Number(
		/Records Found:\s*([\d,]+)/i.exec($.text())?.[1]?.replace(/,/g, '') ?? 0
	);
	const records: RfqRecord[] = [];

	$('tr').each((_, tr) => {
		const row = $(tr);
		const nsnEl = row.find('[id$=_lblNsn]');
		const solEl = row.find('[id$=_lblSolicitation]');
		if (!nsnEl.length || !solEl.length) return;

		const solText = solEl.find('a').first().text().trim() || solEl.text().trim();
		const solicitation = compactSol(solText.split(/\s/)[0] ?? '');
		if (solicitation.length !== 13) return;

		const pdfHref = solEl.find('a[href*="/Downloads/RFQ/"]').attr('href') ?? null;
		const pkgHref = solEl.find('a[href*="rfqrec.aspx"]').attr('href') ?? null;
		const setAsideLabel = solEl.find('img[alt]').attr('alt')?.trim() || null;

		const tech = row.find('[id$=_lblTechnicalDocuments]');
		const techText = tech
			.text()
			.replace(/\u00a0/g, ' ')
			.trim();
		const techHref = tech.find('a').attr('href') ?? null;
		const hasTechDocs = techText === '' ? null : techText.toLowerCase() === 'none' ? false : true;

		const prCell = row.find('[id$=_lblPr]');
		const prHtml = prCell.html() ?? '';
		const prParts = prHtml.split(/<br\s*\/?>/i).map((s) => cheerio.load(s).text().trim());
		const purchaseRequest = prParts[0]?.replace(/\D/g, '') ?? '';
		const qtyMatch = /QTY:\s*([\d,]+)/i.exec(prCell.text());
		const quantity = qtyMatch ? Number(qtyMatch[1].replace(/,/g, '')) : null;

		const statusText = row
			.find('[id$=_lblStatus]')
			.text()
			.replace(/\u00a0/g, ' ')
			.trim();
		const status: RfqRecord['status'] = /removed/i.test(statusText)
			? 'Removed'
			: /open/i.test(statusText)
				? 'Open'
				: 'Unknown';

		const { nsn, nsnDigits, fsc } = canonicalNsn(nsnEl.text());
		const nomenclature = row.find('[id$=_lblNomenclature]').text().trim() || null;
		const issued = toIsoDate(row.find('[id$=_lblIssued]').text()) ?? issuedDate;

		records.push({
			solicitation,
			solicitationFmt: formatSol(solicitation),
			nsn,
			nsnDigits,
			purchaseRequest,
			nomenclature,
			quantity,
			unitOfIssue: null,
			status,
			setAsideCode: setAsideCodeFromLabel(setAsideLabel),
			setAsideLabel,
			hasTechDocs,
			techDocsUrl: techHref ? new URL(techHref, WWW).toString() : null,
			issuedDate: issued,
			postedDate: null,
			returnBy: toIsoDate(row.find('[id$=_lblReturnBy]').text()),
			fsc,
			issuingOffice: officeOf(solicitation),
			solType: solTypeOf(solicitation),
			buyerCode: null,
			amsc: null,
			itemType: nsnDigits ? 1 : 2,
			dibbsUrl: pkgHref ? new URL(pkgHref, WWW).toString() : packageViewUrl(solicitation),
			pdfUrl: pdfHref ? new URL(pdfHref, WWW).toString() : null,
			source: 'listing'
		});
	});

	return { records, recordsFound, hidden: hiddenFields(html) };
}

export interface FetchListingOptions {
	maxPages?: number;
	onPage?: (page: number, totalPages: number, rows: RfqRecord[]) => Promise<void> | void;
}

/**
 * Fetch every page of one issue date. Page 1 is a GET; pages 2..N re-POST the grid's hidden
 * fields with `__EVENTTARGET=<grid>` and `__EVENTARGUMENT=Page$N`.
 */
export async function fetchIssueDate(
	session: DibbsSession,
	mmddyyyy: string,
	opts: FetchListingOptions = {}
): Promise<RfqRecord[]> {
	const url = listingUrl(mmddyyyy);
	const issuedDate = toIsoDate(mmddyyyy);
	const all: RfqRecord[] = [];

	let page = parseListingPage(await session.get(url), issuedDate);
	const totalPages = Math.min(
		Math.max(1, Math.ceil(page.recordsFound / PAGE_SIZE)),
		opts.maxPages ?? 80
	);
	all.push(...page.records);
	await opts.onPage?.(1, totalPages, page.records);

	for (let n = 2; n <= totalPages; n++) {
		const fields = {
			...page.hidden,
			__EVENTTARGET: GRID,
			__EVENTARGUMENT: `Page$${n}`
		};
		const next = parseListingPage(await session.postForm(url, fields), issuedDate);
		const prevFirst = page.records[0];
		const first = next.records[0];
		if (!first) break;
		if (
			prevFirst &&
			first.solicitation === prevFirst.solicitation &&
			first.purchaseRequest === prevFirst.purchaseRequest
		) {
			break; // same page served again → stop rather than loop
		}
		all.push(...next.records);
		await opts.onPage?.(n, totalPages, next.records);
		page = next;
	}
	return all;
}
