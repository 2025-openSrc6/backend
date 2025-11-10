import {
  integer,
  real,
  sqliteTable,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const rounds = sqliteTable(
  "rounds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roundKey: text("round_key").notNull().unique(),
    timeframe: text("timeframe").notNull(), // e.g. 1m, 6h, 1d
    status: text("status").default("scheduled").notNull(),
    lockingStartsAt: integer("locking_starts_at", { mode: "timestamp_ms" }).notNull(),
    lockingEndsAt: integer("locking_ends_at", { mode: "timestamp_ms" }).notNull(),
    settledAt: integer("settled_at", { mode: "timestamp_ms" }),
    winningAsset: text("winning_asset"),
    lockPriceGold: real("lock_price_gold"),
    lockPriceBtc: real("lock_price_btc"),
    settlePriceGold: real("settle_price_gold"),
    settlePriceBtc: real("settle_price_btc"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const bets = sqliteTable(
  "bets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
    walletAddress: text("wallet_address").notNull(),
    selection: text("selection").notNull(), // gold | btc
    amount: real("amount").notNull(),
    txDigest: text("tx_digest"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

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
