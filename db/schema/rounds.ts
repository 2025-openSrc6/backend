import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * rounds 테이블
 * - 라운드의 상태/FSM/가격 정보와 Sui 연동 결과를 모두 저장
 * - 6시간 라운드 기준이지만 type 컬럼으로 1분/1일 등 다른 주기 확장 가능
 */
export const rounds = sqliteTable(
  'rounds',
  {
    /** PK: 라운드 UUID (백엔드에서 생성) */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 라운드 넘버링 (각 type 내에서 1씩 증가) */
    roundNumber: integer('round_number', { mode: 'number' }).notNull(),

    /** 라운드 종류: '1MIN' | '6HOUR' | '1DAY' 등 */
    type: text('type', { length: 10 }).notNull(),

    /** FSM 상태: SCHEDULED / BETTING_OPEN / ... */
    status: text('status', { length: 20 }).notNull().default('SCHEDULED'),

    /** 라운드 시작 시각 (Epoch milliseconds) */
    startTime: integer('start_time', { mode: 'number' }).notNull(),

    /** 라운드 종료 시각 (Epoch milliseconds, 시작 + 6시간 등) */
    endTime: integer('end_time', { mode: 'number' }).notNull(),

    /** 베팅 마감 시각 (Epoch milliseconds, 시작 + 1분) */
    lockTime: integer('lock_time', { mode: 'number' }).notNull(),

    /** 금 시작가 (문자열로 저장하여 정밀도 보존) */
    goldStartPrice: text('gold_start_price'),

    /** 금 종료가 */
    goldEndPrice: text('gold_end_price'),

    /** BTC 시작가 */
    btcStartPrice: text('btc_start_price'),

    /** BTC 종료가 */
    btcEndPrice: text('btc_end_price'),

    /** 시작가 소스 (kitco/coingecko/average/fallback) */
    startPriceSource: text('start_price_source', { length: 20 }),

    /** 시작가가 fallback인지 여부 (0/1) */
    startPriceIsFallback: integer('start_price_is_fallback', { mode: 'boolean' })
      .notNull()
      .default(false),

    /** 시작가 fallback 사유 (REDIS_CACHE, MANUAL 등 텍스트) */
    startPriceFallbackReason: text('start_price_fallback_reason'),

    /** 종료가 소스 */
    endPriceSource: text('end_price_source', { length: 20 }),

    /** 종료가 fallback 여부 */
    endPriceIsFallback: integer('end_price_is_fallback', { mode: 'boolean' })
      .notNull()
      .default(false),

    /** 종료가 fallback 사유 */
    endPriceFallbackReason: text('end_price_fallback_reason'),

    /** 시작 시점 스냅샷 타임스탬프 (Epoch milliseconds) */
    priceSnapshotStartAt: integer('price_snapshot_start_at', { mode: 'number' }),

    /** 종료 시점 스냅샷 타임스탬프 (Epoch milliseconds) */
    priceSnapshotEndAt: integer('price_snapshot_end_at', { mode: 'number' }),

    /** 금 변동률 (예: "0.015") */
    goldChangePercent: text('gold_change_percent'),

    /** BTC 변동률 */
    btcChangePercent: text('btc_change_percent'),

    /** 총 베팅 금액 (DEL) */
    totalPool: integer('total_pool', { mode: 'number' }).notNull().default(0),

    /** 금 팀 베팅 금액 */
    totalGoldBets: integer('total_gold_bets', { mode: 'number' }).notNull().default(0),

    /** BTC 팀 베팅 금액 */
    totalBtcBets: integer('total_btc_bets', { mode: 'number' }).notNull().default(0),

    /** 총 베팅 건수 */
    totalBetsCount: integer('total_bets_count', { mode: 'number' }).notNull().default(0),

    /** 승자: GOLD / BTC / DRAW / NULL */
    winner: text('winner', { length: 10 }),

    /** 플랫폼 수수료율 (문자열로 저장 - 예: "0.05") */
    platformFeeRate: text('platform_fee_rate', { length: 10 }).notNull().default('0.05'),

    /** 실제 징수된 수수료 금액 */
    platformFeeCollected: integer('platform_fee_collected', { mode: 'number' })
      .notNull()
      .default(0),

    /** 정산용 풀 (totalPool - platformFeeCollected) */
    payoutPool: integer('payout_pool', { mode: 'number' }).notNull().default(0),

    /** Sui 상의 BettingPool Object ID */
    suiPoolAddress: text('sui_pool_address', { length: 100 }),

    /** Sui Settlement Object ID */
    suiSettlementObjectId: text('sui_settlement_object_id', { length: 100 }),

    /** BETTING_OPEN 전환 시각 (Epoch milliseconds) */
    bettingOpenedAt: integer('betting_opened_at', { mode: 'number' }),

    /** BETTING_LOCKED 전환 시각 (Epoch milliseconds) */
    bettingLockedAt: integer('betting_locked_at', { mode: 'number' }),

    /** CALCULATING 진입 시각 (Epoch milliseconds) */
    roundEndedAt: integer('round_ended_at', { mode: 'number' }),

    /** 정산 완료 시각 (Epoch milliseconds) */
    settlementCompletedAt: integer('settlement_completed_at', { mode: 'number' }),

    /** 생성 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),

    /** 업데이트 시각 (Epoch milliseconds) */
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    typeStatusIdx: index('idx_rounds_type_status').on(table.type, table.status),
    startTimeIdx: index('idx_rounds_start_time').on(table.startTime),
    roundNumberIdx: index('idx_rounds_round_number').on(table.roundNumber),
    typeRoundUnique: uniqueIndex('idx_rounds_type_round_number').on(table.type, table.roundNumber),
    typeStartTimeUnique: uniqueIndex('idx_rounds_type_start_time').on(table.type, table.startTime),
  }),
);

export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
