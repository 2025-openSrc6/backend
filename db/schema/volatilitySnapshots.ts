import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * volatility_snapshots 테이블
 * - 변동성 지표의 스냅샷 저장
 * - 복잡한 계산 결과를 캐싱하여 API 응답 속도 향상
 * - 매 1분마다 업데이트 또는 배치 계산
 */
export const volatilitySnapshots = sqliteTable(
  'volatility_snapshots',
  {
    /** PK: 변동성 스냅샷 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 자산 심볼: 'PAXG' | 'BTC' | 'ETH' | 'SOL' 등 */
    asset: text('asset', { length: 10 }).notNull(),

    /** 스냅샷 시간 (Unix timestamp, 초 단위) */
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),

    // 기본 변동성 지표
    /** 표준편차 */
    stdDev: real('std_dev').notNull(),

    /** 변동률 (%) */
    percentChange: real('percent_change').notNull(),

    /** Average True Range */
    atr: real('atr'),

    // 볼린저 밴드
    /** 볼린저 밴드 상단 */
    bollingerUpper: real('bollinger_upper'),

    /** 볼린저 밴드 중간 (SMA) */
    bollingerMiddle: real('bollinger_middle'),

    /** 볼린저 밴드 하단 */
    bollingerLower: real('bollinger_lower'),

    /** 볼린저 밴드폭 (%) */
    bollingerBandwidth: real('bollinger_bandwidth'),

    // 추가 지표 (선택사항)
    /** MACD 라인 */
    macd: real('macd'),

    /** MACD Signal 라인 */
    macdSignal: real('macd_signal'),

    /** MACD Histogram */
    macdHistogram: real('macd_histogram'),

    // 메타데이터
    /** 레코드 생성 시각 */
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // 복합 인덱스: 특정 자산의 시간대별 조회 최적화
    assetTimestampIdx: index('idx_volatility_snapshots_asset_timestamp').on(
      table.asset,
      table.timestamp,
    ),
    // UNIQUE 제약: 동일 자산의 동일 시간대 데이터 중복 방지
    uniqueAssetTimestamp: uniqueIndex('idx_volatility_snapshots_unique_asset_timestamp').on(
      table.asset,
      table.timestamp,
    ),
    // 타임스탬프 인덱스: 시간 범위 조회 최적화
    timestampIdx: index('idx_volatility_snapshots_timestamp').on(table.timestamp),
  }),
);

export type VolatilitySnapshot = typeof volatilitySnapshots.$inferSelect;
export type NewVolatilitySnapshot = typeof volatilitySnapshots.$inferInsert;

