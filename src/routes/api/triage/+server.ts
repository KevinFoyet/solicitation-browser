import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';

const STATES = new Set(['interested', 'passed', 'quoted']);

/** Mark an RFQ interested / passed / quoted (state null clears it); optional note. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => error(400, 'invalid JSON'))) as {
		rfqId?: number;
		state?: string | null;
		note?: string | null;
	};
	const rfqId = Number(body.rfqId);
	if (!Number.isInteger(rfqId)) error(400, 'rfqId required');
	const state = body.state ?? null;
	if (state !== null && !STATES.has(state))
		error(400, 'state must be interested | passed | quoted | null');
	const note = typeof body.note === 'string' ? body.note.trim() || null : undefined;

	if (state === null && note === undefined) {
		await db.delete(schema.rfqTriage).where(eq(schema.rfqTriage.rfqId, rfqId));
		return json({ ok: true, state: null });
	}
	const [existing] = await db
		.select()
		.from(schema.rfqTriage)
		.where(eq(schema.rfqTriage.rfqId, rfqId));
	const values = {
		rfqId,
		state: state ?? existing?.state ?? 'interested',
		note: note === undefined ? (existing?.note ?? null) : note,
		updatedAt: new Date()
	};
	const [row] = await db
		.insert(schema.rfqTriage)
		.values(values)
		.onConflictDoUpdate({ target: schema.rfqTriage.rfqId, set: values })
		.returning();
	return json({ ok: true, ...row });
};
