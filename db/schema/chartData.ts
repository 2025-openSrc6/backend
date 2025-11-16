import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const chartData = sqliteTable(
  'chart_data',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    asset: text('asset', { length: 10 }).notNull(),

    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),

    open: real('open').notNull(),
    high: real('high').notNull(),
    low: real('low').notNull(),
    close: real('close').notNull(),
    volume: real('volume').notNull().default(0),

    volatility: real('volatility'),
    averageVolatility: real('average_volatility'),
    volatilityChangeRate: real('volatility_change_rate'),
    volatilityScore: real('volatility_score'),

    movementIntensity: real('movement_intensity'),
    trendStrength: real('trend_strength'),
    relativePosition: real('relative_position'),

    rsi: real('rsi'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),

    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    assetTimestampIdx: index('idx_chart_data_asset_timestamp').on(
      table.asset,
      table.timestamp,
    ),
    uniqueAssetTimestamp: uniqueIndex('idx_chart_data_unique_asset_timestamp').on(
      table.asset,
      table.timestamp,
    ),
    timestampIdx: index('idx_chart_data_timestamp').on(table.timestamp),
  }),
);

export type ChartData = typeof chartData.$inferSelect;
export type NewChartData = typeof chartData.$inferInsert;
