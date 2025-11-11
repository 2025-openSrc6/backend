// app/components/chart/ChartContainer.tsx
'use client';

import { useEffect } from 'react';
import { useChartStore } from '@/store/useChartStore';
import { ChartHeader } from './ChartHeader';
import { PriceChart } from './PriceChart';
import { buildMockComparisonData, mockHistoricalSeries } from './mockChartData';

export function ChartContainer() {
  const {
    config,
    isLoading,
    error,
    setHistoricalData,
    setComparisonData,
    setLoading,
    setError,
  } = useChartStore();

  useEffect(() => {
    // API 연결 전에는 목 데이터를 주입해 UI 흐름을 확인한다.
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      config.selectedAssets.forEach((asset) => {
        const data = mockHistoricalSeries[asset];
        if (data) {
          setHistoricalData(asset, data);
        }
      });

      setComparisonData(buildMockComparisonData(config.selectedAssets, config.timeRange));
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    config.selectedAssets,
    config.timeRange,
    setHistoricalData,
    setComparisonData,
    setLoading,
    setError,
  ]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 text-red-600 bg-red-50 rounded-lg border border-red-200">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Error loading chart data</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <ChartHeader />

      {isLoading && (
        <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">Loading chart data...</p>
          </div>
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {config.viewMode === 'dual' ? (
            <>
              {config.selectedAssets.map((asset) => (
                <PriceChart key={asset} asset={asset} />
              ))}
            </>
          ) : config.viewMode === 'overlay' ? (
            <div className="lg:col-span-2">
              <PriceChart assets={config.selectedAssets} overlay />
            </div>
          ) : (
            <div className="lg:col-span-2">
              <PriceChart asset={config.selectedAssets[0]} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
