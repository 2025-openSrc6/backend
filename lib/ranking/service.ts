import type { RankingItem } from './types';
import { fetchRankingRows } from './repository';

/**
 * limit명까지 랭킹 결과 계산
 * - users.delBalance + achievements.purchasePrice 합산
 * - totalAsset 기준 내림차순 정렬
 */
export async function getRanking(limit: number): Promise<RankingItem[]> {
  const rows = await fetchRankingRows();

  type UserAgg = {
    walletAddress: string;
    delBalance: number;
    achievementTotal: number;
    totalAsset: number;
  };

  const byUser = new Map<string, UserAgg>();

  for (const row of rows) {
    const userId = row.userId;
    if (!userId) continue;

    const existing =
      byUser.get(userId) ??
      {
        walletAddress: row.walletAddress ?? '',
        delBalance: Number(row.delBalance ?? 0),
        achievementTotal: 0,
        totalAsset: 0,
      };

    const price = Number(row.achievementPurchasePrice ?? 0);
    existing.achievementTotal += price;
    existing.totalAsset = existing.delBalance + existing.achievementTotal;

    byUser.set(userId, existing);
  }

  // Map → 배열로 바꿔서 정렬 + limit
  const ranking: RankingItem[] = Array.from(byUser.values())
    .sort((a, b) => b.totalAsset - a.totalAsset)
    .slice(0, limit)
    .map((u) => ({
      walletAddress: u.walletAddress,
      delBalance: u.delBalance,
      achievementTotal: u.achievementTotal,
      totalAsset: u.totalAsset,
    }));

  return ranking;
}