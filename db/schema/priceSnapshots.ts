import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { rounds } from './rounds';

/**
 * price_snapshots 테이블
 * - 라운드별 시작/종료 스냅샷 및 일반 모니터링용 스냅샷을 모두 저장
 * - fallback 사용 시 근거 데이터를 남기고, 감사 추적 시 원본 데이터 재구성에 활용
 */
export const priceSnapshots = sqliteTable(
  'price_snapshots',
  {
    /** PK: 스냅샷 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 연결된 라운드 (GENERAL 스냅샷은 NULL 허용) */
    roundId: text('round_id').references(() => rounds.id, { onDelete: 'set null' }),

    /** 금 가격 (문자열) */
    goldPrice: text('gold_price').notNull(),

    /** BTC 가격 (문자열) */
    btcPrice: text('btc_price').notNull(),

    /** 데이터 소스: kitco/coingecko/average 등 */
    source: text('source', { length: 20 }).notNull(),

    /** 스냅샷 타입: START / END / GENERAL */
    snapshotType: text('snapshot_type', { length: 10 }).notNull(),

    /** 가격 조회 시각 (Epoch milliseconds) */
    snapshotAt: integer('snapshot_at', { mode: 'number' }).notNull(),

    /** 레코드 생성 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    roundIdx: index('idx_price_snapshots_round_id').on(table.roundId),
    snapshotAtIdx: index('idx_price_snapshots_snapshot_at').on(table.snapshotAt),
    snapshotTypeIdx: index('idx_price_snapshots_type').on(table.snapshotType),
  }),
);

export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type NewPriceSnapshot = typeof priceSnapshots.$inferInsert;
