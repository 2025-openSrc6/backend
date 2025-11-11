// lib/utils/chart.ts
// 차트 관련 유틸리티 함수

import type { AssetType, TimeRange } from '@/types/chart';

/**
 * 가격 포맷팅
 */
export function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return price.toFixed(2);
}

/**
 * 타임스탬프 포맷팅
 */
export function formatTimestamp(timestamp: number, range?: TimeRange): string {
  const date = new Date(timestamp);

  if (range === '1h' || range === '24h') {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (range === '7d' || range === '30d') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 퍼센트 변화 계산
 */
export function calculatePercentChange(
  currentPrice: number,
  previousPrice: number
): number {
  if (previousPrice === 0) return 0;
  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

/**
 * 변동성 계산
 */
export function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const variance = prices.reduce((sum, price) => {
    return sum + Math.pow(price - mean, 2);
  }, 0) / prices.length;

  return Math.sqrt(variance);
}

/**
 * 이동평균 계산 (SMA)
 */
export function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
      continue;
    }

    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }

  return sma;
}

/**
 * 지수이동평균 계산 (EMA)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // 첫 번째 EMA는 SMA로 시작
  const firstSMA = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(firstSMA);

  for (let i = period; i < prices.length; i++) {
    const currentEMA = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(currentEMA);
  }

  return ema;
}

/**
 * RSI 계산
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const changes = prices.slice(1).map((price, i) => price - prices[i]);

  for (let i = 0; i < changes.length; i++) {
    if (i < period - 1) {
      rsi.push(NaN);
      continue;
    }

    const recentChanges = changes.slice(i - period + 1, i + 1);
    const gains = recentChanges.filter(c => c > 0);
    const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

/**
 * 데이터 정규화 (0-100 스케일)
 */
export function normalizeData(data: number[]): number[] {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;

  if (range === 0) return data.map(() => 50);

  return data.map(value => ((value - min) / range) * 100);
}

/**
 * 자산 색상 가져오기
 */
export function getAssetColor(asset: AssetType): string {
  const colors: Record<AssetType, string> = {
    PAXG: '#FFD700',
    BTC: '#F7931A',
    ETH: '#627EEA',
    SOL: '#14F195',
  };

  return colors[asset] || '#8884d8';
}

/**
 * 시간 범위를 밀리초로 변환
 */
export function timeRangeToMs(range: TimeRange): number {
  const ranges: Record<TimeRange, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'all': Number.MAX_SAFE_INTEGER,
  };

  return ranges[range];
}
