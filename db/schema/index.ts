import {
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const rounds = pgTable(
  "rounds",
  {
    id: serial("id").primaryKey(),
    roundKey: text("round_key").notNull(),
    timeframe: text("timeframe").notNull(), // e.g. 1m, 6h, 1d
    status: text("status").default("scheduled").notNull(),
    lockingStartsAt: timestamp("locking_starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lockingEndsAt: timestamp("locking_ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    settledAt: timestamp("settled_at", {
      withTimezone: true,
      mode: "date",
    }),
    winningAsset: text("winning_asset"),
    lockPriceGold: numeric("lock_price_gold", { precision: 18, scale: 6 }),
    lockPriceBtc: numeric("lock_price_btc", { precision: 18, scale: 8 }),
    settlePriceGold: numeric("settle_price_gold", { precision: 18, scale: 6 }),
    settlePriceBtc: numeric("settle_price_btc", { precision: 18, scale: 8 }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    roundKeyIdx: uniqueIndex("rounds_round_key_unique").on(table.roundKey),
  }),
);

export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id")
    .notNull()
    .references(() => rounds.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  selection: text("selection").notNull(), // gold | btc
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  txDigest: text("tx_digest"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const roundsRelations = relations(rounds, ({ many }) => ({
  bets: many(bets),
}));

export const betsRelations = relations(bets, ({ one }) => ({
  round: one(rounds, {
    fields: [bets.roundId],
    references: [rounds.id],
  }),
}));

export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
