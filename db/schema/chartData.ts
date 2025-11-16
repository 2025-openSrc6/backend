import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * chart_data 테이블
 * - OHLCV(Open, High, Low, Close, Volume) 캔들스틱 데이터 저장
 * - 게임성 지표 및 변동성 지표 계산값 캐싱
 * - 실시간 가격 데이터를 1분 단위로 저장
 */
export const chartData = sqliteTable(
  'chart_data',
  {
    /** PK: 차트 데이터 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 자산 심볼: 'PAXG' | 'BTC' | 'ETH' | 'SOL' 등 */
    asset: text('asset', { length: 10 }).notNull(),

    /** 캔들 시작 시간 (Unix timestamp, 초 단위) */
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),

    // OHLCV 데이터
    /** 시가 */
    open: real('open').notNull(),

    /** 고가 */
    high: real('high').notNull(),

    /** 저가 */
    low: real('low').notNull(),

    /** 종가 */
    close: real('close').notNull(),

    /** 거래량 */
    volume: real('volume').notNull().default(0),

    // 변동성 지표
    /** 현재 변동성 (표준편차) */
    volatility: real('volatility'),

    /** 평균 변동성 (과거 N일 평균, 기준선) */
    averageVolatility: real('average_volatility'),

    /** 변동성 변동률 = 현재 변동성 / 평균 변동성 (게임 비교용 핵심 지표) */
    volatilityChangeRate: real('volatility_change_rate'),

    /** 변동성 점수 (0-100 정규화, 게임 UI 표시용) */
    volatilityScore: real('volatility_score'),

    // 게임성 강화 지표
    /** 움직임 강도 = (high - low) / close * 100 */
    movementIntensity: real('movement_intensity'),

    /** 트렌드 강도 = |close - open| / (high - low) * 100 */
    trendStrength: real('trend_strength'),

    /** 상대적 위치 = (close - low) / (high - low) * 100 */
    relativePosition: real('relative_position'),

    /** RSI 지표 (0-100) */
    rsi: real('rsi'),

    // 메타데이터
    /** 레코드 생성 시각 */
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),

    /** 레코드 업데이트 시각 */
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    /** 복합 인덱스: 특정 자산의 시간대별 조회 최적화 */
    assetTimestampIdx: index('idx_chart_data_asset_timestamp').on(
      table.asset,
      table.timestamp,
    ),
    /** UNIQUE 제약: 동일 자산의 동일 시간대 데이터 중복 방지 */
    uniqueAssetTimestamp: uniqueIndex('idx_chart_data_unique_asset_timestamp').on(
      table.asset,
      table.timestamp,
    ),
    /** 타임스탬프 인덱스: 시간 범위 조회 최적화 */
    timestampIdx: index('idx_chart_data_timestamp').on(table.timestamp),
  }),
);

export type ChartData = typeof chartData.$inferSelect;
export type NewChartData = typeof chartData.$inferInsert;
