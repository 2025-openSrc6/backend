'use client';

import { Card } from '@/components/ui/card';
import { Zap } from 'lucide-react';

type Props = {
  points: number;
};

export function PointsPanel({ points }: Props) {
  return (
    <Card className="bg-slate-900/40 p-4 text-slate-50">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-5 w-5 text-cyan-300" />
        <h3 className="text-sm font-semibold">포인트</h3>
      </div>
      <p className="text-3xl font-bold text-cyan-200">{points.toLocaleString()}</p>
      <p className="mt-1 text-xs text-slate-500">라운드 당첨/출석으로 적립 예정</p>
    </Card>
  );
}
