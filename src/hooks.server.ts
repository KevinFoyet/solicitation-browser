import { building } from '$app/env';
import { db } from '#lib/server/db/index.js';
import { startScheduler } from '#lib/server/ingest/scheduler.js';

// Arm the in-process ingestion scheduler once the server starts (not during `vite build`).
if (!building && process.env.SCRAPE_ON_BOOT !== '0') startScheduler(db);
