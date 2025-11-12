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

// ==========================================
// 차트 모듈 스키마 
// ==========================================

export const chartData = sqliteTable(
  "chart_data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    asset: text("asset").notNull(), // 'PAXG', 'BTC', 'ETH', 'SOL', etc.
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(), // 캔들 시작 시간

    // OHLCV 데이터
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),

    // 계산된 지표 (캐시용)
    volatility: real("volatility"), // 표준편차
    rsi: real("rsi"), // RSI(14)

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // 복합 인덱스: 자산과 타임스탬프로 빠른 조회
    assetTimestampIdx: primaryKey({ columns: [table.asset, table.timestamp] }),
  })
);

/**
 * VolatilitySnapshot - 변동성 지표
 */
export const volatilitySnapshots = sqliteTable(
  "volatility_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    asset: text("asset").notNull(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),

    // 기본 변동성 지표
    stdDev: real("std_dev").notNull(), // 표준편차
    percentChange: real("percent_change").notNull(), // 변동률 (%)
    atr: real("atr"), // Average True Range

    // 볼린저 밴드
    bollingerUpper: real("bollinger_upper"),
    bollingerMiddle: real("bollinger_middle"),
    bollingerLower: real("bollinger_lower"),
    bollingerBandwidth: real("bollinger_bandwidth"), // 밴드폭 (%)

    // 추가 지표
    macd: real("macd"), // MACD 라인
    macdSignal: real("macd_signal"), // Signal 라인
    macdHistogram: real("macd_histogram"), // 히스토그램

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // 복합 인덱스
    assetTimestampIdx: primaryKey({ columns: [table.asset, table.timestamp] }),
  })
);

/**
 * BettingMarkers - 차트 위 베팅 마커 정보
 * 베팅 시스템과의 연동 인터페이스
 */
export const bettingMarkers = sqliteTable(
  "betting_markers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(), // User 테이블 FK (추후 연결)
    asset: text("asset").notNull(), // 베팅한 자산 ('PAXG', 'BTC')
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(), // 베팅 시점

    // 베팅 정보
    betAmount: real("bet_amount").notNull(), // 베팅 금액
    entryPrice: real("entry_price").notNull(), // 진입 가격
    exitPrice: real("exit_price"), // 청산 가격 (결과 확정 시)

    // 결과
    result: text("result"), // 'win', 'lose', 'pending'
    profit: real("profit"), // 손익 (exitPrice - entryPrice) * betAmount

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  }
);

// Relations
export const chartDataRelations = relations(chartData, ({ one }) => ({
  volatilitySnapshot: one(volatilitySnapshots, {
    fields: [chartData.asset, chartData.timestamp],
    references: [volatilitySnapshots.asset, volatilitySnapshots.timestamp],
  }),
}));

export const bettingMarkersRelations = relations(bettingMarkers, ({ one }) => ({
  chartData: one(chartData, {
    fields: [bettingMarkers.asset, bettingMarkers.timestamp],
    references: [chartData.asset, chartData.timestamp],
  }),
}));

// Type exports
export type ChartData = typeof chartData.$inferSelect;
export type NewChartData = typeof chartData.$inferInsert;

export type VolatilitySnapshot = typeof volatilitySnapshots.$inferSelect;
export type NewVolatilitySnapshot = typeof volatilitySnapshots.$inferInsert;

export type BettingMarker = typeof bettingMarkers.$inferSelect;
export type NewBettingMarker = typeof bettingMarkers.$inferInsert;
