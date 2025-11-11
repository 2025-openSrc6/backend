// app/components/chart/PriceChart.tsx
'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useChartStore } from '@/store/useChartStore';
import type { AssetType } from '@/types/chart';
import { formatPrice, formatTimestamp } from '@/lib/utils/chart';

interface PriceChartProps {
  asset?: AssetType;
  assets?: AssetType[];
  overlay?: boolean;
}

export function PriceChart({ asset, assets, overlay = false }: PriceChartProps) {
  const {
    config,
    historicalData,
    realtimeData,
    bettingMarkers,
  } = useChartStore();

  const displayAssets = overlay ? assets || [] : asset ? [asset] : [];

  const chartData = useMemo(() => {
    if (displayAssets.length === 0) return [];

    const firstAsset = displayAssets[0];
    const firstData = historicalData.get(firstAsset) || [];

    return firstData.map((point, index) => {
      const dataPoint: any = {
        timestamp: point.timestamp,
        time: formatTimestamp(point.timestamp),
      };

      displayAssets.forEach((assetKey) => {
        const assetData = historicalData.get(assetKey);
        if (assetData && assetData[index]) {
          dataPoint[assetKey] = assetData[index].price;
        }
      });

      return dataPoint;
    });
  }, [displayAssets, historicalData]);

  const ChartComponent = config.chartType === 'area' ? AreaChart : LineChart;

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {overlay
            ? `${displayAssets.join(' vs ')} Comparison`
            : `${asset} Price Chart`}
        </h3>
        {!overlay && asset && realtimeData.has(asset) && (
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="font-medium text-gray-900">
              ${formatPrice(realtimeData.get(asset)!.price)}
            </span>
            <span
              className={
                realtimeData.get(asset)!.changePercent24h >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }
            >
              {realtimeData.get(asset)!.changePercent24h >= 0 ? '+' : ''}
              {realtimeData.get(asset)!.changePercent24h.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ChartComponent data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => value.split(' ')[1] || value}
            stroke="#6b7280"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `$${formatPrice(value)}`}
            stroke="#6b7280"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                  <p className="text-sm font-medium mb-2 text-gray-900">
                    {payload[0].payload.time}
                  </p>
                  {payload.map((entry: any) => (
                    <p
                      key={entry.dataKey}
                      className="text-sm"
                      style={{ color: entry.color }}
                    >
                      {entry.dataKey}: ${formatPrice(entry.value)}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Legend />

          {displayAssets.map((assetKey) => {
            const color = config.colors[assetKey] || '#8884d8';
            return config.chartType === 'area' ? (
              <Area
                key={assetKey}
                type="monotone"
                dataKey={assetKey}
                stroke={color}
                fill={color}
                fillOpacity={0.3}
              />
            ) : (
              <Line
                key={assetKey}
                type="monotone"
                dataKey={assetKey}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            );
          })}

          {/* 베팅 마커 표시 */}
          {config.showBettingMarkers &&
            !overlay &&
            asset &&
            bettingMarkers
              .filter((marker) => marker.asset === asset)
              .map((marker) => (
                <ReferenceLine
                  key={marker.id}
                  x={marker.timestamp}
                  stroke={marker.result === 'win' ? '#22c55e' : '#ef4444'}
                  strokeDasharray="3 3"
                  label={{
                    value: marker.result === 'win' ? '✓' : '✗',
                    position: 'top',
                  }}
                />
              ))}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
