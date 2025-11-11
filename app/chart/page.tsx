// app/chart/page.tsx
'use client';

import { Suspense } from 'react';
import { ChartContainer } from '@/app/components/chart/ChartContainer';

export default function ChartPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          DeltaX Chart Analysis
        </h1>
        <p className="text-gray-600">
          Compare PAXG (Gold) and BTC volatility-adjusted returns
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        }
      >
        <ChartContainer />
      </Suspense>
    </div>
  );
}
