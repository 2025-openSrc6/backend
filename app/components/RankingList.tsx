"use client"

import { Card } from "@/components/ui/card"

const mockRanking = [
  { rank: 1, name: "dy", volume: 42000 },
  { rank: 2, name: "taeung", volume: 33500 },
  { rank: 3, name: "arthur", volume: 29200 },
  { rank: 4, name: "hyeonjun", volume: 20100 },
  { rank: 5, name: "guest01", volume: 15000 },
]

export function RankingList() {
  return (
    <Card className="bg-slate-900/40 p-4 text-slate-50">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">오늘의 랭킹</h2>
        <span className="text-xs text-slate-400">based on betting volume</span>
      </div>
      <ul className="space-y-2">
        {mockRanking.map((user) => (
          <li
            key={user.rank}
            className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-xs font-bold text-cyan-200">
                {user.rank}
              </span>
              <span className="text-sm">{user.name}</span>
            </div>
            <span className="text-sm font-mono text-cyan-200">{user.volume.toLocaleString()} pt</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}