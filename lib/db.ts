/* eslint-disable @typescript-eslint/no-require-imports */
import { initializeDb } from '@/db/client';
import * as schema from '@/db/schema';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cache } from 'react';
import type { D1Database } from '@cloudflare/workers-types';

export type RemoteDrizzleClient = ReturnType<typeof initializeDb>;
type BetterSqliteModule = typeof import('drizzle-orm/better-sqlite3');
export type LocalDrizzleClient = ReturnType<BetterSqliteModule['drizzle']>;
export type DbClient = RemoteDrizzleClient | LocalDrizzleClient;

interface CloudflareEnv {
  DB: D1Database;
}

const globalDbState = globalThis as typeof globalThis & {
  __deltaxLocalDrizzle?: LocalDrizzleClient | null;
};

/**
 * API 라우트에서 DB 클라이언트를 초기화합니다
 * 요청당 새로운 클라이언트를 생성합니다 (Cloudflare Workers 권장 패턴)
 *
 * @example
 * ```typescript
 * import { getDb } from "@/lib/db";
 *
 * export async function GET(request: Request) {
 *   const db = getDb();
 *   const rounds = await db.select().from(rounds);
 *   return Response.json(rounds);
 * }
 * ```
 */
export const getDb = cache((): DbClient => {
  const remoteDb = getCloudflareDrizzle();
  if (remoteDb) {
    return remoteDb;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error("Cloudflare D1 database binding 'DB' is not available");
  }

  return getLocalDrizzle();
});

function getCloudflareDrizzle(): RemoteDrizzleClient | null {
  try {
    const { env } = getCloudflareContext();
    const db = (env as CloudflareEnv).DB as D1Database | undefined;
    if (!db) {
      return null;
    }
    return initializeDb({ DB: db });
  } catch {
    // Cloudflare context가 없는 경우 (로컬 개발 환경)
    return null;
  }
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
