import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const rounds = sqliteTable(
  'rounds',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roundKey: text('round_key', { length: 100 }).notNull().unique(),
    type: text('type', { length: 10 }).notNull(), // '1MIN', '6HOUR', '1DAY'
    status: text('status', { length: 20 }).notNull().default('SCHEDULED'),

    startTime: integer('start_time', { mode: 'timestamp' }).notNull(),
    endTime: integer('end_time', { mode: 'timestamp' }).notNull(),
    lockTime: integer('lock_time', { mode: 'timestamp' }).notNull(),

    // decimal을 text로 저장 (정확도 보장)
    goldStartPrice: text('gold_start_price'),
    goldEndPrice: text('gold_end_price'),
    btcStartPrice: text('btc_start_price'),
    btcEndPrice: text('btc_end_price'),

    // 'GOLD', 'BTC', 'DRAW'
    winner: text('winner', { length: 10 }),

    totalGoldBets: integer('total_gold_bets', { mode: 'number' }).default(0),
    totalBtcBets: integer('total_btc_bets', { mode: 'number' }).default(0),
    totalPool: integer('total_pool', { mode: 'number' }).default(0),

    suiPoolAddress: text('sui_pool_address', { length: 66 }),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    statusIdx: index('rounds_status_idx').on(table.status),
    typeIdx: index('rounds_type_idx').on(table.type),
    startTimeIdx: index('rounds_start_time_idx').on(table.startTime),
  }),
);

// 타입 export
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
