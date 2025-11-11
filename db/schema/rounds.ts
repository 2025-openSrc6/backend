import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const rounds = sqliteTable(
  'rounds',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text('type', { length: 10 }).notNull(), // '1MIN', '6HOUR', '1DAY'
    status: text('status', { length: 20 }).notNull().default('SCHEDULED'),

    start_time: integer('start_time', { mode: 'timestamp' }).notNull(),
    end_time: integer('end_time', { mode: 'timestamp' }).notNull(),
    lock_time: integer('lock_time', { mode: 'timestamp' }).notNull(),

    // decimal을 text로 저장 (정확도 보장)
    gold_start_price: text('gold_start_price'),
    gold_end_price: text('gold_end_price'),
    btc_start_price: text('btc_start_price'),
    btc_end_price: text('btc_end_price'),

    // 'GOLD', 'BTC', 'DRAW'
    winner: text('winner', { length: 10 }),

    total_gold_bets: integer('total_gold_bets', { mode: 'number' }).default(0),
    total_btc_bets: integer('total_btc_bets', { mode: 'number' }).default(0),
    total_pool: integer('total_pool', { mode: 'number' }).default(0),

    sui_pool_address: text('sui_pool_address', { length: 66 }),

    created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    statusIdx: index('rounds_status_idx').on(table.status),
    typeIdx: index('rounds_type_idx').on(table.type),
    startTimeIdx: index('rounds_start_time_idx').on(table.start_time),
  }),
);

export const bets = sqliteTable(
  'bets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    round_id: text('round_id')
      .references(() => rounds.id)
      .notNull(),
    user_address: text('user_address', { length: 66 }).notNull(),

    // 'GOLD', 'BTC'
    prediction: text('prediction', { length: 10 }).notNull(),
    amount: integer('amount', { mode: 'number' }).notNull(),
    // 'DEL', 'CRYSTAL'
    currency: text('currency', { length: 10 }).notNull(),

    payout: integer('payout', { mode: 'number' }),

    sui_tx_hash: text('sui_tx_hash', { length: 66 }),

    created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    roundIdx: index('bets_round_idx').on(table.round_id),
    userIdx: index('bets_user_idx').on(table.user_address),
    roundUserIdx: index('bets_round_user_idx').on(table.round_id, table.user_address),
  }),
);

// 타입 export
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
