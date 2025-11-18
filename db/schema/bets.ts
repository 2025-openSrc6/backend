import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { rounds } from './rounds';
import { users } from './users';

/**
 * bets 테이블
 * - 각 유저의 단일 라운드 베팅 기록
 * - resultStatus(승/패)와 settlementStatus(진행도)를 분리해 멱등 정산을 지원
 */
export const bets = sqliteTable(
  'bets',
  {
    /** PK: 베팅 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 라운드 FK */
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),

    /** 유저 FK (users.id) */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** 선택한 자산: 'GOLD' | 'BTC' */
    prediction: text('prediction', { length: 10 }).notNull(),

    /** 베팅 금액 (DEL 기준 정수) */
    amount: integer('amount', { mode: 'number' }).notNull(),

    /** 통화 표기: 실사용은 'DEL', 추후 'CRYSTAL' 1:1 매핑 가능 */
    currency: text('currency', { length: 10 }).notNull().default('DEL'),

    /** 결과 상태 (WON/LOST/REFUNDED/FAILED) */
    resultStatus: text('result_status', { length: 20 }).notNull().default('PENDING'),

    /** 정산 진행 상태 (PENDING/PROCESSING/COMPLETED/FAILED) */
    settlementStatus: text('settlement_status', { length: 20 }).notNull().default('PENDING'),

    /** 지급 금액 (승리/환불 시 계산 값) */
    payoutAmount: integer('payout_amount', { mode: 'number' }).notNull().default(0),

    /** 온체인 Bet Object ID */
    suiBetObjectId: text('sui_bet_object_id', { length: 100 }),

    /** 베팅 트랜잭션 해시 */
    suiTxHash: text('sui_tx_hash', { length: 130 }),

    /** 정산 트랜잭션 해시 */
    suiPayoutTxHash: text('sui_payout_tx_hash', { length: 130 }),

    /** 베팅 트랜잭션 체인 타임스탬프 (Epoch milliseconds) */
    suiTxTimestamp: integer('sui_tx_timestamp', { mode: 'number' }),

    /** 정산 트랜잭션 체인 타임스탬프 (Epoch milliseconds) */
    suiPayoutTimestamp: integer('sui_payout_timestamp', { mode: 'number' }),

    /** 클라이언트 요청 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),

    /** 서버가 실제 처리한 시각 (Epoch milliseconds, 분쟁 시 기준) */
    processedAt: integer('processed_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),

    /** 정산 완료 시각 (Epoch milliseconds) */
    settledAt: integer('settled_at', { mode: 'number' }),
  },
  (table) => ({
    roundIdx: index('idx_bets_round_id').on(table.roundId),
    userIdx: index('idx_bets_user_id').on(table.userId),
    settlementStatusIdx: index('idx_bets_settlement_status').on(table.settlementStatus),
    resultStatusIdx: index('idx_bets_result_status').on(table.resultStatus),
    createdAtIdx: index('idx_bets_created_at').on(table.createdAt),
    uniqueUserRound: uniqueIndex('idx_bets_user_round').on(table.userId, table.roundId),
  }),
);

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
