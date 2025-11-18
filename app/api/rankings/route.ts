import { NextResponse } from 'next/server';
import { getDb } from "@/lib/db"
import { users, achievements } from "@/db/schema";

import { eq } from "drizzle-orm";

/**
 * [GET] /api/rankings
 * -------------------
 * 랭킹 데이터를 반환
 */

export async function GET(request: Request, context: any) {

  //api/rankings?limit=가져올랭킹수
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "20") || 20;

  const db = await getDb();

  // 1) users ↔ achievements LEFT JOIN
  //    - join 결과: 한 유저 + 그 유저의 각 achievement 행
  const rows = await db
    .select({
      userId: users.id,
      walletAddress: users.suiAddress,
      delBalance: users.delBalance,
      achievementValue: achievements.purchasePrice,
    })
    .from(users)
    .leftJoin(achievements, eq(users.id, achievements.userId));

  // 2) 유저별로 총자산 계산
  type UserAgg = {
    walletAddress: string;
    delBalance: number;
    achievementTotal: number;
    totalAsset: number;
  };

  const byUser = new Map<string, UserAgg>();

  //그룹핑
  for (const row of rows) {
    const userId = row.userId;
    if (!userId) continue;

    const existing =
      byUser.get(userId) ??
      {
        walletAddress: row.walletAddress ?? "",
        delBalance: Number(row.delBalance ?? 0),
        achievementTotal: 0,
        totalAsset: 0,
      };

      const purchasePrice = Number(row.achievementValue ?? 0);

      existing.achievementTotal += purchasePrice;
      existing.totalAsset = existing.delBalance + existing.achievementTotal;

      byUser.set(userId, existing);
  }

  // 3) Map → 배열로 변환 후, 총자산 기준 내림차순 정렬
  const ranking = Array.from(byUser.values())
    .sort((a, b) => b.totalAsset - a.totalAsset)
    .slice(0, limit)
    .map((u) => ({
      walletAddress: u.walletAddress,
      delBalance: u.delBalance,
      achievementTotal: u.achievementTotal,
      totalAsset: u.totalAsset,
    }));

  return NextResponse.json(ranking);
}
