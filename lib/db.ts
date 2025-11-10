import { initializeDb } from "@/db/client";
import { CloudflareEnv } from "./types";

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
export function getDbFromContext(context: any) {
  const env = context.cloudflare?.env as CloudflareEnv;

  if (!env || !env.DB) {
    throw new Error(
      "D1 database not available. Ensure your wrangler.toml is properly configured."
    );
  }

  return initializeDb({ DB: env.DB });
}
