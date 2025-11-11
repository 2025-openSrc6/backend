import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '@/db/schema';

export type Env = {
  DB: D1Database;
};

export function createDbClient(env: Env) {
  return drizzle(env.DB, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
