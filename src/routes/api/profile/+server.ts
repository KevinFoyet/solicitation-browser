import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';

const SET_ASIDE_CODES = new Set(['Y', 'H', 'R', 'L', 'A', 'E', 'N']);

const strings = (v: unknown, name: string): string[] => {
	if (v === undefined) return [];
	if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
		error(400, `${name} must be an array of strings`);
	}
	return v.map((s) => s.trim()).filter(Boolean);
};

/** The single vendor profile (id = 1); empty defaults until it is saved. */
export const GET: RequestHandler = async () => {
	const [row] = await db.select().from(schema.vendorProfile).where(eq(schema.vendorProfile.id, 1));
	return json(
		row ?? { id: 1, name: null, fscs: [], watchNsns: [], setAsideCodes: [], minQty: null }
	);
};

export const PUT: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => error(400, 'invalid JSON'))) as Record<
		string,
		unknown
	>;

	const fscs = strings(body.fscs, 'fscs').map((f) => f.replace(/\D/g, ''));
	if (fscs.some((f) => f.length !== 4)) error(400, 'each FSC must be 4 digits');
	const watchNsns = strings(body.watchNsns, 'watchNsns').map((n) => n.replace(/\D/g, ''));
	if (watchNsns.some((n) => n.length !== 13)) error(400, 'each NSN must be 13 digits');
	const setAsideCodes = strings(body.setAsideCodes, 'setAsideCodes').map((c) => c.toUpperCase());
	if (setAsideCodes.some((c) => !SET_ASIDE_CODES.has(c))) error(400, 'unknown set-aside code');
	const minQty = body.minQty == null ? null : Number(body.minQty);
	if (minQty !== null && (!Number.isInteger(minQty) || minQty < 0))
		error(400, 'minQty must be a non-negative integer');
	const name = typeof body.name === 'string' ? body.name.trim() || null : null;

	const values = { id: 1, name, fscs, watchNsns, setAsideCodes, minQty, updatedAt: new Date() };
	const [row] = await db
		.insert(schema.vendorProfile)
		.values(values)
		.onConflictDoUpdate({ target: schema.vendorProfile.id, set: values })
		.returning();
	return json(row);
};
