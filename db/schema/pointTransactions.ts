import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * point_transactions 테이블
 * - DEL/CRYSTAL 잔액 변동의 근거를 남길 때 사용
 * - 베팅 차감, 승리 지급, 출석 보상, 관리자 조정 등을 모두 단일 로깅 테이블로 관리
 */
export const pointTransactions = sqliteTable(
  'point_transactions',
  {
    /** PK: 트랜잭션 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 유저 FK */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** 거래 유형: DEPOSIT/WITHDRAWAL/BET_PLACED/ ... */
    type: text('type', { length: 30 }).notNull(),

    /** 통화: DEL / CRYSTAL */
    currency: text('currency', { length: 10 }).notNull(),

    /** 증감 금액 (양수=증가, 음수=차감) */
    amount: integer('amount', { mode: 'number' }).notNull(),

    /** 거래 이전 잔액 (감사 추적) */
    balanceBefore: integer('balance_before', { mode: 'number' }).notNull(),

    /** 거래 이후 잔액 */
    balanceAfter: integer('balance_after', { mode: 'number' }).notNull(),

    /** 참조 ID (bet_id, round_id 등) */
    referenceId: text('reference_id'),

    /** 참조 타입: 'BET' | 'ROUND' | 'NFT' 등 */
    referenceType: text('reference_type', { length: 20 }),

    /** 설명 또는 메모 */
    description: text('description'),

    /** 관련 Sui 트랜잭션 해시 (있을 경우) */
    suiTxHash: text('sui_tx_hash', { length: 130 }),

    /** 생성 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    userIdx: index('idx_point_tx_user_id').on(table.userId),
    typeIdx: index('idx_point_tx_type').on(table.type),
    createdAtIdx: index('idx_point_tx_created_at').on(table.createdAt),
    referenceIdx: index('idx_point_tx_reference').on(table.referenceType, table.referenceId),
  }),
);

export type PointTransaction = typeof pointTransactions.$inferSelect;
export type NewPointTransaction = typeof pointTransactions.$inferInsert;
