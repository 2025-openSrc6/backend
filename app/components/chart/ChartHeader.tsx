// app/components/chart/ChartHeader.tsx
'use client';

import { useChartStore } from '@/store/useChartStore';
import type { AssetType, TimeRange, ViewMode, ChartType } from '@/types/chart';

const ASSETS: AssetType[] = ['PAXG', 'BTC', 'ETH', 'SOL'];
const TIME_RANGES: TimeRange[] = ['1h', '24h', '7d', '30d', 'all'];
const VIEW_MODES: ViewMode[] = ['dual', 'overlay', 'single'];
const CHART_TYPES: ChartType[] = ['candlestick', 'line', 'area'];

export function ChartHeader() {
  const {
    config,
    setViewMode,
    setChartType,
    setTimeRange,
    setSelectedAssets,
    toggleVolatility,
    toggleBettingMarkers,
  } = useChartStore();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* 자산 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Assets:</span>
        <div className="flex gap-2">
          {ASSETS.map((asset) => (
            <button
              key={asset}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                config.selectedAssets.includes(asset)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => {
                const newAssets = config.selectedAssets.includes(asset)
                  ? config.selectedAssets.filter((a) => a !== asset)
                  : [...config.selectedAssets, asset];
                setSelectedAssets(newAssets);
              }}
            >
              {asset}
            </button>
          ))}
        </div>
      </div>

      {/* 시간 범위 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Time:</span>
        <select
          value={config.timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TIME_RANGES.map((range) => (
            <option key={range} value={range}>
              {range}
            </option>
          ))}
        </select>
      </div>

      {/* 뷰 모드 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">View:</span>
        <select
          value={config.viewMode}
          onChange={(e) => setViewMode(e.target.value as ViewMode)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {VIEW_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>

      {/* 차트 타입 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Type:</span>
        <select
          value={config.chartType}
          onChange={(e) => setChartType(e.target.value as ChartType)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CHART_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* 토글 옵션 */}
      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            config.showVolatility
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={toggleVolatility}
        >
          Volatility
        </button>
        <button
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            config.showBettingMarkers
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={toggleBettingMarkers}
        >
          Bets
        </button>
      </div>
    </div>
  );
}
