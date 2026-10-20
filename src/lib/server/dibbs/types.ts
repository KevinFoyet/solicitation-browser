/** A normalized RFQ line item as produced by either DIBBS source. */
export interface RfqRecord {
	solicitation: string; // compact, e.g. SPE1C127Q0088
	solicitationFmt: string; // SPE1C1-27-Q-0088
	nsn: string; // canonical: 8475-01-389-6117 or a raw part number
	nsnDigits: string | null;
	purchaseRequest: string;
	nomenclature: string | null;
	quantity: number | null;
	unitOfIssue: string | null;
	status: 'Open' | 'Removed' | 'Unknown';
	setAsideCode: string | null;
	setAsideLabel: string | null;
	hasTechDocs: boolean | null;
	techDocsUrl: string | null;
	issuedDate: string | null; // YYYY-MM-DD
	postedDate: string | null;
	returnBy: string | null;
	fsc: string | null;
	issuingOffice: string;
	solType: string | null;
	buyerCode: string | null;
	amsc: string | null;
	itemType: 1 | 2 | null;
	dibbsUrl: string;
	pdfUrl: string | null;
	source: 'listing' | 'index_file';
}
