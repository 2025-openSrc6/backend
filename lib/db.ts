import { initializeDb } from '@/db/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cache } from 'react';
import type { D1Database } from '@cloudflare/workers-types';

export type RemoteDrizzleClient = ReturnType<typeof initializeDb>;
export type DbClient = RemoteDrizzleClient;

interface CloudflareEnv {
  DB: D1Database;
}

/**
 * API 라우트에서 DB 클라이언트를 초기화합니다
 * 요청당 새로운 클라이언트를 생성합니다 (Cloudflare Workers 권장 패턴)
 *
 * getPlatformProxy를 통해 로컬 개발 환경에서도 D1 API를 사용합니다.
 * next.config.ts의 initOpenNextCloudflareForDev()가 D1 바인딩을 제공합니다.
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
  if (!remoteDb) {
    const hint =
      process.env.NODE_ENV === 'development'
        ? 'Ensure initOpenNextCloudflareForDev() is called in next.config.ts'
        : 'Check Cloudflare D1 binding configuration in wrangler.toml';
    throw new Error(`D1 database binding 'DB' is not available. ${hint}`);
  }
  return remoteDb;
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
    // Cloudflare context가 없는 경우
    return null;
  }
}
