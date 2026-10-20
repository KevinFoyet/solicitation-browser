import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIndexFile, parseIndexLine } from './indexFile.js';
import { parseListingPage } from './listing.js';
import {
	canonicalNsn,
	compactSol,
	formatSol,
	setAsideCodeFromLabel,
	toIsoDate
} from './normalize.js';
import { hiddenFields } from './session.js';

const fixture = (name: string) =>
	readFileSync(new URL(`../../../../fixtures/${name}`, import.meta.url), 'latin1');

describe('normalize', () => {
	it('formats solicitation numbers both ways', () => {
		expect(compactSol('SPE1C1-27-Q-0088')).toBe('SPE1C127Q0088');
		expect(formatSol('SPE1C127Q0088')).toBe('SPE1C1-27-Q-0088');
	});

	it('canonicalizes NSNs, DLA alphanumeric stock numbers and part numbers', () => {
		expect(canonicalNsn('8475013896117')).toEqual({
			nsn: '8475-01-389-6117',
			nsnDigits: '8475013896117',
			fsc: '8475'
		});
		expect(canonicalNsn('8475-01-389-6117')).toEqual(canonicalNsn('8475013896117'));
		expect(canonicalNsn('5325-00-174-2882 Mil-Spec').nsn).toBe('5325-00-174-2882');
		expect(canonicalNsn('5330LLSZWA481')).toEqual({
			nsn: '5330-LL-SZW-A481',
			nsnDigits: null,
			fsc: '5330'
		});
		expect(canonicalNsn('1Q0C4HH660-36060')).toEqual({
			nsn: '1Q0C4HH660-36060',
			nsnDigits: null,
			fsc: null
		});
	});

	it('parses both DIBBS date formats', () => {
		expect(toIsoDate('10-20-2026')).toBe('2026-10-20');
		expect(toIsoDate('10/26/26')).toBe('2026-10-26');
		expect(toIsoDate('')).toBeNull();
	});

	it('maps set-aside icon labels to codes', () => {
		expect(setAsideCodeFromLabel('Unrestricted/Not Set Aside')).toBe('N');
		expect(setAsideCodeFromLabel('Total Small Business Set-Aside')).toBe('Y');
		expect(setAsideCodeFromLabel('Service Disabled Veteran Owned')).toBe('R');
		expect(setAsideCodeFromLabel(null)).toBeNull();
	});
});

describe('index file (inYYMMDD.txt)', () => {
	const line =
		'SPE1C127Q00878455014911469                                    701751179010/26/26SPE1C127Q0087.pdf  0036000EASERVICE RIBBON,AWARD DAW02G1N000';

	it('parses a fixed-width line into a record', () => {
		const r = parseIndexLine(line, '2026-10-19');
		expect(r).toMatchObject({
			solicitation: 'SPE1C127Q0087',
			solicitationFmt: 'SPE1C1-27-Q-0087',
			nsn: '8455-01-491-1469',
			nsnDigits: '8455014911469',
			purchaseRequest: '7017511790',
			returnBy: '2026-10-26',
			quantity: 36000,
			unitOfIssue: 'EA',
			nomenclature: 'SERVICE RIBBON,AWARD',
			buyerCode: 'DAW02',
			amsc: 'G',
			itemType: 1,
			setAsideCode: 'N',
			setAsideLabel: 'Unrestricted',
			fsc: '8455',
			issuingOffice: 'SPE1C1',
			solType: 'Q',
			postedDate: '2026-10-19',
			source: 'index_file',
			dibbsUrl: 'https://www.dibbs.bsm.dla.mil/rfq/rfqrec.aspx?sn=SPE1C127Q0087',
			pdfUrl: 'https://dibbs2.bsm.dla.mil/Downloads/RFQ/7/SPE1C127Q0087.PDF'
		});
	});

	it('parses the whole daily file', () => {
		const records = parseIndexFile(fixture('in261019.txt'), '2026-10-19');
		expect(records).toHaveLength(1723);
		expect(records.every((r) => /^[A-Z0-9]{13}$/.test(r.solicitation))).toBe(true);
		expect(records.filter((r) => r.setAsideCode === 'Y')).toHaveLength(197);
		expect(records.filter((r) => r.itemType === 2)).toHaveLength(13);
	});

	it('ignores blank and malformed lines', () => {
		expect(parseIndexLine('', null)).toBeNull();
		expect(parseIndexLine('garbage', null)).toBeNull();
	});
});

describe('listing page (RfqRecs.aspx)', () => {
	const html = fixture('listing-10-20-2026-page1.html');
	const page = parseListingPage(html, '2026-10-20');

	it('reads the record count and 50 rows', () => {
		expect(page.recordsFound).toBe(1141);
		expect(page.records).toHaveLength(50);
	});

	it('extracts every column of the first row', () => {
		expect(page.records[0]).toMatchObject({
			solicitation: 'SPE1C127Q0088',
			solicitationFmt: 'SPE1C1-27-Q-0088',
			nsn: '8475-01-389-6117',
			nsnDigits: '8475013896117',
			fsc: '8475',
			nomenclature: 'OXYGEN MASK RECEIVE',
			purchaseRequest: '7018736960',
			quantity: 1500,
			status: 'Open',
			hasTechDocs: false,
			setAsideLabel: 'Unrestricted/Not Set Aside',
			setAsideCode: 'N',
			issuedDate: '2026-10-20',
			returnBy: '2026-11-20',
			issuingOffice: 'SPE1C1',
			solType: 'Q',
			dibbsUrl: 'https://www.dibbs.bsm.dla.mil/rfq/rfqrec.aspx?sn=SPE1C127Q0088',
			pdfUrl: 'https://dibbs2.bsm.dla.mil/Downloads/RFQ/8/SPE1C127Q0088.PDF',
			source: 'listing'
		});
	});

	it('detects Removed rows', () => {
		expect(page.records.filter((r) => r.status === 'Removed').length).toBeGreaterThan(0);
	});

	it('captures the WebForms hidden fields needed for postback paging', () => {
		expect(page.hidden.__VIEWSTATE).toBeTruthy();
		expect(page.hidden.__EVENTVALIDATION).toBeTruthy();
		expect(hiddenFields(html).__VIEWSTATEGENERATOR).toBeTruthy();
	});
});
