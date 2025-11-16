'use client';

import { useEffect, useState } from "react";
import { Card } from '@/components/ui/card';

// 데이터 타입
type RankingUser = {
  walletAddress: string;
  delBalance: number;
  achievementTotal: number;
  totalAsset: number;
};

export function RankingList() {
  const [ranking, setRanking] = useState<RankingUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRanking() {
      try {
        // GET /api/rankings?limit=20 호출
        const res = await fetch("/api/rankings?limit=20", {
          method: "GET",
        });

        if (!res.ok) {
          throw new Error("랭킹 오류");
        }

        const data = await res.json();
        setRanking(data); // 받아온 배열 set
      } catch (err) {
        console.error("[RankingList] API ERROR:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, []);

  // 로딩 화면
  if (loading) {
    return (
      <Card className="bg-slate-900/40 p-4 text-slate-50">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">오늘의 랭킹</h2>
        <div className="text-slate-400">랭킹 불러오는 중...</div>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/40 p-4 text-slate-50">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">오늘의 랭킹</h2>
        <span className="text-xs text-slate-400">자산 총계 기준</span>
      </div>

      <ul className="space-y-2">
        {ranking.map((user, index) => (
          <li
            key={user.walletAddress}
            className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-xs font-bold text-cyan-200">
                {index + 1}
              </span>

              <span className="text-sm font-mono">
                {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
              </span>
            </div>

            <span className="text-sm font-mono text-cyan-200">
              {user.totalAsset.toLocaleString()} DEL
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}