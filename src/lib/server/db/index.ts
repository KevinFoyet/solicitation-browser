import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema.js';
import { createDb } from './client.js';

const { db, pool } = createDb(DATABASE_URL);

export { db, pool, schema };
