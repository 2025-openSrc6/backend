import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { rounds } from './rounds';

/**
 * settlements 테이블
 * - 라운드별 정산 결과 요약을 저장 (1:1 관계)
 * - 온체인 Settlement Object와 동기화된 총 풀/배당 정보 확인용
 */
export const settlements = sqliteTable(
  'settlements',
  {
    /** PK: 정산 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 라운드 FK (고유) */
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),

    /** 승자: GOLD / BTC / DRAW */
    winner: text('winner', { length: 10 }).notNull(),

    /** 총 베팅 금액 */
    totalPool: integer('total_pool', { mode: 'number' }).notNull(),

    /** 승자 풀 금액 */
    winningPool: integer('winning_pool', { mode: 'number' }).notNull(),

    /** 패자 풀 금액 */
    losingPool: integer('losing_pool', { mode: 'number' }).notNull(),

    /** 플랫폼 수수료 */
    platformFee: integer('platform_fee', { mode: 'number' }).notNull(),

    /** 실제 배당 풀 (수수료 제외) */
    payoutPool: integer('payout_pool', { mode: 'number' }).notNull(),

    /** 승자 1 DEL당 배당 비율 (문자열) */
    payoutRatio: text('payout_ratio', { length: 20 }).notNull(),

    /** 승자 수 */
    totalWinners: integer('total_winners', { mode: 'number' }).notNull(),

    /** 패자 수 */
    totalLosers: integer('total_losers', { mode: 'number' }).notNull(),

    /** Sui Settlement Object ID */
    suiSettlementObjectId: text('sui_settlement_object_id', { length: 100 }),

    /** 배당 계산 완료 시각 (Epoch milliseconds) */
    calculatedAt: integer('calculated_at', { mode: 'number' }).notNull(),

    /** 정산 트랜잭션 완료 시각 (Epoch milliseconds) */
    completedAt: integer('completed_at', { mode: 'number' }),

    /** 레코드 생성 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    roundUnique: uniqueIndex('idx_settlements_round_id').on(table.roundId),
    completedIdx: index('idx_settlements_completed_at').on(table.completedAt),
  }),
);

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
