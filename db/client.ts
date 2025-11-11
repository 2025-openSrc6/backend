import { drizzle } from 'drizzle-orm/d1';
import type { CloudflareEnv } from '@/lib/types';
import * as schema from '@/db/schema';

/**
 * D1 데이터베이스에 대한 Drizzle ORM 클라이언트를 생성합니다.
 *
 * @param env Cloudflare Worker 환경 변수
 * @returns Drizzle ORM 클라이언트
 *
 * @example
 * ```typescript
 * import { initializeDb } from "@/db/client";
 *
 * export async function GET(request: Request, context: any) {
 *   const env = context.cloudflare?.env as CloudflareEnv;
 *   const db = initializeDb({ DB: env.DB });
 *   const data = await db.select().from(rounds);
 * }
 * ```
 */
export function initializeDb(env: CloudflareEnv) {
  if (!env.DB) {
    throw new Error("D1 database binding 'DB' is not available");
  }

  return drizzle(env.DB, {
    schema,
    logger: process.env.NODE_ENV === 'development',
  });
}

export type DbClient = ReturnType<typeof initializeDb>;
