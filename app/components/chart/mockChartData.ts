// app/components/chart/mockChartData.ts
// 임시 목 데이터로 차트/비교 지표를 채워주는 유틸

import { normalizeData } from '@/lib/utils/chart';
import type {
  AssetType,
  ComparisonData,
  PriceData,
  TimeRange,
} from '@/types/chart';

const HOURS = 24;
const ONE_HOUR_MS = 60 * 60 * 1000;

function createSeries(asset: AssetType, basePrice: number, swing = 0.02): PriceData[] {
  const start = Date.now() - HOURS * ONE_HOUR_MS;

  return Array.from({ length: HOURS }, (_, index) => {
    const timestamp = start + index * ONE_HOUR_MS;
    const oscillation = Math.sin(index / 3) * swing * basePrice;
    const drift = index * 0.002 * basePrice;
    const price = Number((basePrice + drift + oscillation).toFixed(2));
    const change = Number((price - basePrice).toFixed(2));
    const changePercent = Number(((change / basePrice) * 100).toFixed(2));

    return {
      asset,
      timestamp,
      price,
      volume: Math.round(basePrice * 5 + index * 25),
      change24h: change,
      changePercent24h: changePercent,
    };
  });
}

export const mockHistoricalSeries: Record<AssetType, PriceData[]> = {
  PAXG: createSeries('PAXG', 2450, 0.008),
  BTC: createSeries('BTC', 65000, 0.035),
  ETH: createSeries('ETH', 3200, 0.04),
  SOL: createSeries('SOL', 140, 0.06),
};

export function buildMockComparisonData(
  assets: AssetType[],
  timeRange: TimeRange
): ComparisonData {
  const availableAssets = assets.filter((asset) => mockHistoricalSeries[asset]);

  const normalizedPrices: ComparisonData['normalizedPrices'] = {};
  const priceChangeComparison: ComparisonData['priceChangeComparison'] = {};

  availableAssets.forEach((asset) => {
    const series = mockHistoricalSeries[asset];
    const pricePoints = series.map((point) => point.price);
    normalizedPrices[asset] = normalizeData(pricePoints);

    const firstPrice = pricePoints[0];
    const lastPrice = pricePoints[pricePoints.length - 1];
    const absolute = Number((lastPrice - firstPrice).toFixed(2));
    const percentage = Number(((absolute / firstPrice) * 100).toFixed(2));
    const volatilityAdjusted = Number(
      (percentage / (asset === 'BTC' ? 1.4 : asset === 'SOL' ? 1.2 : 1)).toFixed(2)
    );

    priceChangeComparison[asset] = {
      absolute,
      percentage,
      volatilityAdjusted,
    };
  });

  const recommendation = availableAssets.reduce(
    (best, asset) => {
      const current = priceChangeComparison[asset]?.volatilityAdjusted ?? -Infinity;
      if (current > best.score) {
        return {
          asset,
          score: current,
          reason:
            asset === 'PAXG'
              ? '금 기반 자산으로 안정적인 우상향을 보이고 있어요.'
              : asset === 'BTC'
              ? '높은 변동성이지만 단기 모멘텀이 강합니다.'
              : '변동성 대비 수익률이 가장 우수합니다.',
        };
      }
      return best;
    },
    { asset: 'PAXG' as AssetType, score: -Infinity, reason: '' }
  );

  return {
    assets: availableAssets,
    timeRange,
    normalizedPrices,
    volatilityRatio: Number(
      (
        (priceChangeComparison['PAXG']?.volatilityAdjusted ?? 1) /
        (priceChangeComparison['BTC']?.volatilityAdjusted ?? 1)
      ).toFixed(2)
    ),
    priceChangeComparison,
    recommendation: {
      asset: recommendation.asset,
      confidence: 0.78,
      reason: recommendation.reason,
    },
  };
}
