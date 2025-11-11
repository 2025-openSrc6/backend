// types/chart.ts
// 차트 모듈 타입 정의

/**
 * 지원하는 자산 타입
 */
export type AssetType = 'PAXG' | 'BTC' | 'ETH' | 'SOL';

/**
 * 시간 범위 타입
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

/**
 * 차트 타입
 */
export type ChartType = 'candlestick' | 'line' | 'area';

/**
 * 차트 뷰 모드
 */
export type ViewMode = 'dual' | 'overlay' | 'single';

/**
 * 기본 가격 데이터
 */
export interface PriceData {
  asset: AssetType;
  timestamp: number;
  price: number;
  volume: number;
  change24h: number;
  changePercent24h: number;
}

/**
 * 캔들스틱 데이터
 */
export interface CandlestickData {
  asset: AssetType;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 변동성 지표
 */
export interface VolatilityMetrics {
  asset: AssetType;
  timestamp: number;

  // 기본 지표
  stdDev: number; // 표준편차
  percentChange: number; // 변동률

  // 고급 지표
  atr?: number; // Average True Range
  bollingerBands?: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number; // 밴드폭
  };

  // 추가 지표
  rsi?: number; // Relative Strength Index
  macd?: {
    macd: number;
    signal: number;
    histogram: number;
  };
}

/**
 * 비교 분석 데이터
 */
export interface ComparisonData {
  assets: AssetType[];
  timeRange: TimeRange;

  // 정규화된 가격 (0-100 스케일)
  normalizedPrices: {
    [key in AssetType]?: number[];
  };

  // 변동성 비율
  volatilityRatio: number; // PAXG/BTC

  // 상승률 비교
  priceChangeComparison: {
    [key in AssetType]?: {
      absolute: number; // 절대값
      percentage: number; // 퍼센트
      volatilityAdjusted: number; // 변동성 조정 상승률
    };
  };

  // AI 추천
  recommendation?: {
    asset: AssetType;
    confidence: number;
    reason: string;
  };
}

/**
 * 베팅 마커 데이터
 */
export interface BettingMarker {
  id: string;
  userId: string;
  asset: AssetType;
  timestamp: number;
  betAmount: number;
  entryPrice: number;
  currentPrice?: number;
  result?: 'win' | 'lose' | 'pending';
  profit?: number;
}

/**
 * 차트 설정
 */
export interface ChartConfig {
  viewMode: ViewMode;
  chartType: ChartType;
  timeRange: TimeRange;
  selectedAssets: AssetType[];

  // 표시 옵션
  showVolume: boolean;
  showVolatility: boolean;
  showBettingMarkers: boolean;
  showTechnicalIndicators: boolean;

  // 색상 설정
  colors: {
    [key in AssetType]?: string;
  };
}
