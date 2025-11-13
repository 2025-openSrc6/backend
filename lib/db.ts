import { initializeDb } from '@/db/client';
import { CloudflareEnv, NextContext } from './types';
import * as schema from '@/db/schema';

type DrizzleClient = ReturnType<typeof initializeDb>;

// Local fallback (Node runtime)
let localDrizzle: DrizzleClient | null = null;

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
export function getDbFromContext(context: NextContext) {
  const env = context.cloudflare?.env as CloudflareEnv | undefined;

  // 1) Cloudflare D1 바인딩이 있으면 D1로 연결
  if (env?.DB) {
    return initializeDb({ DB: env.DB });
  }

  // 2) 로컬 폴백: better-sqlite3로 로컬 SQLite 파일에 연결
  if (localDrizzle) {
    return localDrizzle;
  }

  // 동적 import로 엣지 번들 분리
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } =
    require('drizzle-orm/better-sqlite3') as typeof import('drizzle-orm/better-sqlite3');

  // DATABASE_URL이 'file:./delta.db' 형태일 수 있어 전처리
  const dbFile = process.env.DATABASE_URL?.replace(/^file:/, '') || 'delta.db';

  const sqlite = new Database(dbFile);
  localDrizzle = drizzle(sqlite, {
    schema,
    logger: process.env.NODE_ENV === 'development',
  }) as DrizzleClient;
  return localDrizzle;
}
