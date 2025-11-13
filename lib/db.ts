/* eslint-disable @typescript-eslint/no-require-imports */
import { initializeDb } from '@/db/client';
import type { CloudflareEnv, NextContext } from './types';
import * as schema from '@/db/schema';

type RemoteDrizzleClient = ReturnType<typeof initializeDb>;
type BetterSqliteModule = typeof import('drizzle-orm/better-sqlite3');
type LocalDrizzleClient = ReturnType<BetterSqliteModule['drizzle']>;
type DbClient = RemoteDrizzleClient | LocalDrizzleClient;

const globalDbState = globalThis as typeof globalThis & {
  __deltaxLocalDrizzle?: LocalDrizzleClient | null;
};

/**
 * API 라우트에서 DB 클라이언트를 초기화합니다
 *
 * @example
 * ```typescript
 * import { getDbFromContext } from "@/lib/db";
 *
 * export async function GET(request: Request, context: any) {
 *   const db = getDbFromContext(context);
 *   const rounds = await db.select().from(rounds);
 *   return Response.json(rounds);
 * }
 * ```
 */
export function getDbFromContext(context: NextContext): DbClient {
  const env = context.cloudflare?.env;

  const remoteDb = getCloudflareDrizzle(env);
  if (remoteDb) {
    return remoteDb;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error("Cloudflare D1 database binding 'DB' is not available");
  }

  return getLocalDrizzle();
}

function getCloudflareDrizzle(env?: CloudflareEnv): RemoteDrizzleClient | null {
  if (!env?.DB) {
    return null;
  }

  return initializeDb({ DB: env.DB });
}

function getLocalDrizzle(): LocalDrizzleClient {
  if (globalDbState.__deltaxLocalDrizzle) {
    return globalDbState.__deltaxLocalDrizzle;
  }

  const betterSqliteModule = require('better-sqlite3') as typeof import('better-sqlite3');
  const Database =
    (betterSqliteModule as { default?: typeof betterSqliteModule }).default ?? betterSqliteModule;
  const { drizzle } =
    require('drizzle-orm/better-sqlite3') as typeof import('drizzle-orm/better-sqlite3');

  const dbFile = process.env.DATABASE_URL?.replace(/^file:/, '') ?? 'delta.db';
  const sqlite = new Database(dbFile);

  globalDbState.__deltaxLocalDrizzle = drizzle(sqlite, {
    schema,
    logger: process.env.NODE_ENV === 'development',
  });

  return globalDbState.__deltaxLocalDrizzle;
}
/* eslint-enable @typescript-eslint/no-require-imports */
