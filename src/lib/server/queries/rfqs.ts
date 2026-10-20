import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	lte,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import type { Filters } from '#lib/filters.js';
import type { VendorProfile } from '#lib/server/db/schema.js';
import { compactSol } from '#lib/server/dibbs/normalize.js';

const { rfqs, rfqTriage, vendorProfile, scrapeRuns } = schema;

export interface QueryContext {
	profile: VendorProfile | null;
	/** started_at of the latest successful run; rows first seen after it are "new". */
	lastOkRunStartedAt: Date | null;
}

export const profileIsEmpty = (p: VendorProfile | null) =>
	!p ||
	(p.fscs.length === 0 &&
		p.watchNsns.length === 0 &&
		p.setAsideCodes.length === 0 &&
		p.minQty == null);

type Dimension = 'fsc' | 'office' | 'setAside' | 'solType';

/** Translate URL filters into one WHERE clause. `exclude` lets a facet ignore its own dimension. */
export function buildWhere(f: Filters, ctx: QueryContext, exclude?: Dimension): SQL | undefined {
	const w: (SQL | undefined)[] = [];

	if (f.q) {
		const q = f.q.trim();
		const digits = q.replace(/\D/g, '');
		const like = `%${q}%`;
		const terms: (SQL | undefined)[] = [
			ilike(rfqs.nomenclature, like),
			ilike(rfqs.nsn, like),
			ilike(rfqs.solicitationFmt, like),
			ilike(rfqs.solicitation, `%${compactSol(q)}%`)
		];
		if (digits.length >= 4)
			terms.push(
				sql`${rfqs.nsnDigits} LIKE ${digits + '%'}`,
				sql`${rfqs.purchaseRequest} LIKE ${digits + '%'}`
			);
		w.push(or(...terms));
	}

	if (exclude !== 'fsc' && f.fsc.length) w.push(inArray(rfqs.fsc, f.fsc));
	if (exclude !== 'office' && f.office.length) w.push(inArray(rfqs.issuingOffice, f.office));
	if (exclude !== 'solType' && f.solType.length) w.push(inArray(rfqs.solType, f.solType));
	if (exclude !== 'setAside' && f.setAside.length) {
		const codes = f.setAside.filter((c) => c !== 'unknown');
		const parts: (SQL | undefined)[] = [];
		if (codes.length) parts.push(inArray(rfqs.setAsideCode, codes));
		if (f.setAside.includes('unknown')) parts.push(isNull(rfqs.setAsideCode));
		w.push(or(...parts));
	}

	if (f.status === 'open') w.push(eq(rfqs.status, 'Open'));
	else if (f.status === 'removed') w.push(eq(rfqs.status, 'Removed'));

	// Expired RFQs are noise unless the user explicitly asks for everything.
	if (f.status !== 'all') w.push(or(isNull(rfqs.returnBy), gte(rfqs.returnBy, sql`CURRENT_DATE`)));
	if (f.due !== 'all') w.push(lte(rfqs.returnBy, sql`CURRENT_DATE + ${Number(f.due)}::int`));

	if (f.qtyMin != null) w.push(gte(rfqs.quantity, f.qtyMin));
	if (f.qtyMax != null) w.push(lte(rfqs.quantity, f.qtyMax));
	if (f.techDocs === 'yes') w.push(eq(rfqs.hasTechDocs, true));
	if (f.techDocs === 'no') w.push(or(eq(rfqs.hasTechDocs, false), isNull(rfqs.hasTechDocs)));
	if (f.issuedFrom)
		w.push(gte(sql`COALESCE(${rfqs.issuedDate}, ${rfqs.postedDate})`, f.issuedFrom));
	if (f.issuedTo) w.push(lte(sql`COALESCE(${rfqs.issuedDate}, ${rfqs.postedDate})`, f.issuedTo));

	if (f.state === 'unreviewed') w.push(isNull(rfqTriage.state));
	else if (f.state !== 'all') w.push(eq(rfqTriage.state, f.state));

	if (f.newOnly && ctx.lastOkRunStartedAt) w.push(gte(rfqs.firstSeenAt, ctx.lastOkRunStartedAt));

	if (f.mine && !profileIsEmpty(ctx.profile)) {
		const p = ctx.profile!;
		const match: (SQL | undefined)[] = [];
		if (p.fscs.length) match.push(inArray(rfqs.fsc, p.fscs));
		if (p.watchNsns.length) match.push(inArray(rfqs.nsnDigits, p.watchNsns));
		if (match.length) w.push(or(...match));
		if (p.setAsideCodes.length)
			w.push(or(isNull(rfqs.setAsideCode), inArray(rfqs.setAsideCode, p.setAsideCodes)));
		if (p.minQty != null) w.push(gte(rfqs.quantity, p.minQty));
	}

	const parts = w.filter((x): x is SQL => !!x);
	return parts.length ? and(...parts) : undefined;
}

const ORDER: Record<Filters['sort'], SQL[]> = {
	issued_desc: [
		sql`COALESCE(${rfqs.issuedDate}, ${rfqs.postedDate}) DESC NULLS LAST`,
		asc(rfqs.returnBy),
		asc(rfqs.id)
	],
	due_asc: [sql`${rfqs.returnBy} ASC NULLS LAST`, asc(rfqs.id)],
	qty_desc: [sql`${rfqs.quantity} DESC NULLS LAST`, asc(rfqs.id)],
	nsn_asc: [asc(rfqs.nsn), asc(rfqs.id)],
	sol_asc: [asc(rfqs.solicitation), asc(rfqs.id)]
};

export type RfqRow = Awaited<ReturnType<typeof listRfqs>>['rows'][number];

export async function listRfqs(f: Filters, ctx: QueryContext) {
	const where = buildWhere(f, ctx);

	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				rfq: rfqs,
				triageState: rfqTriage.state,
				triageNote: rfqTriage.note,
				isNew: ctx.lastOkRunStartedAt
					? sql<boolean>`${rfqs.firstSeenAt} >= ${ctx.lastOkRunStartedAt}`
					: sql<boolean>`false`,
				daysLeft: sql<number | null>`(${rfqs.returnBy} - CURRENT_DATE)::int`
			})
			.from(rfqs)
			.leftJoin(rfqTriage, eq(rfqTriage.rfqId, rfqs.id))
			.where(where)
			.orderBy(...ORDER[f.sort])
			.limit(f.pageSize)
			.offset((f.page - 1) * f.pageSize),
		db
			.select({ total: count() })
			.from(rfqs)
			.leftJoin(rfqTriage, eq(rfqTriage.rfqId, rfqs.id))
			.where(where)
	]);
	return { rows, total };
}

export interface Facet {
	value: string;
	count: number;
}

/** Counts for the sidebar; each facet ignores its own dimension so options stay clickable. */
export async function facets(f: Filters, ctx: QueryContext) {
	const facet = async (
		dim: Dimension,
		column:
			typeof rfqs.fsc | typeof rfqs.issuingOffice | typeof rfqs.setAsideCode | typeof rfqs.solType,
		limit = 40
	): Promise<Facet[]> => {
		const rows = await db
			.select({ value: column, count: count() })
			.from(rfqs)
			.leftJoin(rfqTriage, eq(rfqTriage.rfqId, rfqs.id))
			.where(buildWhere(f, ctx, dim))
			.groupBy(column)
			.orderBy(desc(count()), asc(column))
			.limit(limit);
		return rows.map((r) => ({ value: r.value ?? 'unknown', count: r.count }));
	};
	const [fsc, office, setAside, solType] = await Promise.all([
		facet('fsc', rfqs.fsc, 60),
		facet('office', rfqs.issuingOffice, 40),
		facet('setAside', rfqs.setAsideCode, 10),
		facet('solType', rfqs.solType, 5)
	]);
	return { fsc, office, setAside, solType };
}

export async function getProfile(): Promise<VendorProfile | null> {
	const [row] = await db.select().from(vendorProfile).where(eq(vendorProfile.id, 1));
	return row ?? null;
}

export async function getRuns() {
	const [latest] = await db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.startedAt)).limit(1);
	const [lastOk] = await db
		.select()
		.from(scrapeRuns)
		.where(eq(scrapeRuns.status, 'ok'))
		.orderBy(desc(scrapeRuns.startedAt))
		.limit(1);
	// "New" = first seen since the run before the latest successful one; if there is only one
	// successful run everything it loaded counts as new.
	const [previousOk] = lastOk
		? await db
				.select()
				.from(scrapeRuns)
				.where(and(eq(scrapeRuns.status, 'ok'), sql`${scrapeRuns.startedAt} < ${lastOk.startedAt}`))
				.orderBy(desc(scrapeRuns.startedAt))
				.limit(1)
		: [];
	return {
		latest: latest ?? null,
		lastOk: lastOk ?? null,
		newSince: (previousOk ?? lastOk)?.startedAt ?? null
	};
}
