import { getDb } from '@/lib/db';
import { users, achievements } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { RawRankingRow } from './types';

/**
 * 랭킹 계산에 필요한 raw row들을 DB에서 모두 가져오는 함수
 * - users ↔ achievements LEFT JOIN
 * - 아직 그룹핑/합산 안 된 상태
 */
export async function fetchRankingRows(): Promise<RawRankingRow[]> {
  const db = await getDb();

  const rows = await db
    .select({
      userId: users.id,
      walletAddress: users.suiAddress,
      delBalance: users.delBalance,
      achievementPurchasePrice: achievements.purchasePrice,
    })
    .from(users)
    .leftJoin(achievements, eq(users.id, achievements.userId));

  return rows;
}
