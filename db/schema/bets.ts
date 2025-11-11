import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { rounds } from './rounds';

export const bets = sqliteTable(
  'bets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roundId: text('round_id')
      .references(() => rounds.id)
      .notNull(),
    userAddress: text('user_address', { length: 66 }).notNull(),

    // 'GOLD', 'BTC'
    prediction: text('prediction', { length: 10 }).notNull(),
    amount: integer('amount', { mode: 'number' }).notNull(),
    // 'DEL', 'CRYSTAL'
    currency: text('currency', { length: 10 }).notNull(),

    payout: integer('payout', { mode: 'number' }),

    suiTxHash: text('sui_tx_hash', { length: 66 }),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => ({
    roundIdx: index('bets_round_idx').on(table.roundId),
    userIdx: index('bets_user_idx').on(table.userAddress),
    roundUserIdx: index('bets_round_user_idx').on(table.roundId, table.userAddress),
  }),
);

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
