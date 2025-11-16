'use client';

import { Card } from '@/components/ui/card';

export function DashboardMiniChart() {
  // 나중에 여기에 props로
  return (
    <Card className="bg-[#141820] border border-slate-800/60 rounded-2xl p-4">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">BTC vs PAXG</p>
          <h3 className="text-sm font-semibold text-slate-100">Strength Index</h3>
        </div>
        <div className="flex gap-2 rounded-full bg-slate-900/50 p-1">
          <button className="rounded-full bg-slate-950/70 px-3 py-1 text-[10px] text-slate-200">
            1H
          </button>
          <button className="rounded-full px-3 py-1 text-[10px] text-slate-400 hover:text-slate-100">
            4H
          </button>
          <button className="rounded-full px-3 py-1 text-[10px] text-slate-400 hover:text-slate-100">
            1D
          </button>
        </div>
      </div>

      {/* 차트 영역 (모양만) */}
      <div className="relative h-32 overflow-hidden rounded-xl bg-gradient-to-b from-slate-900/60 to-slate-900/10">
        {/* 그리드 라인 */}
        <div className="absolute inset-0">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-slate-700/20"
              style={{ top: `${(i + 1) * 25}%` }}
            />
          ))}
        </div>

        {/* BTC 라인 (파란색) */}
        <svg className="absolute inset-0 h-full w-full">
          <polyline
            fill="none"
            stroke="rgba(59,130,246,0.9)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,90 40,75 80,82 120,50 160,55 200,35 240,40 280,30 320,42"
          />
        </svg>

        {/* PAXG 라인 (노란색) */}
        <svg className="absolute inset-0 h-full w-full">
          <polyline
            fill="none"
            stroke="rgba(234,179,8,0.85)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,70 40,68 80,75 120,65 160,72 200,60 240,63 280,58 320,65"
          />
        </svg>
      </div>

      {/* 하단 정보 */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] text-slate-500">다음 라운드까지 · 03분 41초</p>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-400" />
          <span className="text-[11px] text-slate-200">BTC 1.6%</span>
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="text-[11px] text-slate-200">PAXG 0.9%</span>
        </div>
      </div>
    </Card>
  );
}
