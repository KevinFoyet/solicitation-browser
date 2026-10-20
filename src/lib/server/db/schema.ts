import { sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	date,
	index,
	integer,
	pgTable,
	smallint,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';

/**
 * One row per RFQ line item (solicitation × NSN × purchase request).
 * `nsn` is canonical: dashed `8475-01-389-6117` for 13-digit NSNs, raw part number otherwise,
 * so rows from the listing page and the daily index file collapse onto the same unique key.
 */
export const rfqs = pgTable(
	'rfqs',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		solicitation: text('solicitation').notNull(), // compact: SPE1C127Q0088
		solicitationFmt: text('solicitation_fmt').notNull(), // display: SPE1C1-27-Q-0088
		nsn: text('nsn').notNull(),
		nsnDigits: text('nsn_digits'), // 8475013896117, null for part numbers
		purchaseRequest: text('purchase_request').notNull().default(''),
		nomenclature: text('nomenclature'),
		quantity: integer('quantity'),
		unitOfIssue: text('unit_of_issue'), // EA, BG, PG ... (index file only)
		status: text('status').notNull().default('Open'), // Open | Removed | Unknown
		setAsideCode: text('set_aside_code'), // Y H R L A E N
		setAsideLabel: text('set_aside_label'),
		hasTechDocs: boolean('has_tech_docs'),
		techDocsUrl: text('tech_docs_url'),
		issuedDate: date('issued_date', { mode: 'string' }),
		postedDate: date('posted_date', { mode: 'string' }),
		returnBy: date('return_by', { mode: 'string' }),
		fsc: text('fsc'), // first 4 NSN digits, only for item_type = 1
		issuingOffice: text('issuing_office'), // SPE1C1
		solType: text('sol_type'), // Q | T | U
		buyerCode: text('buyer_code'),
		amsc: text('amsc'),
		itemType: smallint('item_type'), // 1 NSN, 2 part number
		dibbsUrl: text('dibbs_url').notNull(), // Package View
		pdfUrl: text('pdf_url'),
		source: text('source').notNull(), // listing | index_file
		firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		unique('rfqs_sol_nsn_pr_uq').on(t.solicitation, t.nsn, t.purchaseRequest),
		index('rfqs_fsc_idx').on(t.fsc),
		index('rfqs_return_by_idx').on(t.returnBy),
		index('rfqs_issued_idx').on(t.issuedDate.desc()),
		index('rfqs_status_idx').on(t.status),
		index('rfqs_office_idx').on(t.issuingOffice),
		index('rfqs_nomen_trgm').using('gin', t.nomenclature.op('gin_trgm_ops')),
		index('rfqs_nsn_trgm').using('gin', t.nsn.op('gin_trgm_ops'))
	]
);

/** Single-row table (id = 1): what this vendor sells and is eligible for. */
export const vendorProfile = pgTable('vendor_profile', {
	id: smallint('id').primaryKey().default(1),
	name: text('name'),
	fscs: text('fscs')
		.array()
		.notNull()
		.default(sql`'{}'::text[]`),
	watchNsns: text('watch_nsns')
		.array()
		.notNull()
		.default(sql`'{}'::text[]`), // compact digits
	setAsideCodes: text('set_aside_codes')
		.array()
		.notNull()
		.default(sql`'{}'::text[]`),
	minQty: integer('min_qty'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

export const rfqTriage = pgTable('rfq_triage', {
	rfqId: bigint('rfq_id', { mode: 'number' })
		.primaryKey()
		.references(() => rfqs.id, { onDelete: 'cascade' }),
	state: text('state').notNull(), // interested | passed | quoted
	note: text('note'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

export const scrapeRuns = pgTable('scrape_runs', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true }),
	status: text('status').notNull(), // running | ok | failed
	trigger: text('trigger').notNull(), // boot | manual | cron | cli
	source: text('source'), // listing | index_file
	datesCovered: text('dates_covered')
		.array()
		.notNull()
		.default(sql`'{}'::text[]`),
	pagesFetched: integer('pages_fetched').notNull().default(0),
	rowsParsed: integer('rows_parsed').notNull().default(0),
	rowsUpserted: integer('rows_upserted').notNull().default(0),
	error: text('error')
});

export type Rfq = typeof rfqs.$inferSelect;
export type NewRfq = typeof rfqs.$inferInsert;
export type VendorProfile = typeof vendorProfile.$inferSelect;
export type RfqTriage = typeof rfqTriage.$inferSelect;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
