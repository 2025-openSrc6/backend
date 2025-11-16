import { getDbFromContext } from '@/lib/db';
import { chartData, volatilitySnapshots } from '@/db/schema';
import { fetchKlines, type SupportedAsset } from '@/lib/services/binance';
import {
  calculateStdDev,
  calculateVolatilityChangeRate,
  calculateVolatilityScore,
  calculateMovementIntensity,
  calculateTrendStrength,
  calculateRelativePosition,
  calculateRSI,
  calculateATR,
  calculateBollingerBands,
  calculateMACD,
} from '@/lib/services/volatility';
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import type { NextContext } from '@/lib/types';

const TARGET_ASSETS: SupportedAsset[] = ['PAXG', 'BTC'];
const VOLATILITY_LOOKBACK = 20;
const AVERAGE_VOLATILITY_PERIOD = 100;

export async function POST(request: NextRequest, context: NextContext) {
  try {
    const db = getDbFromContext(context);
    const results: Record<string, { chartData: string; volatilitySnapshot: string }> = {};

    for (const asset of TARGET_ASSETS) {
      const klines = await fetchKlines(asset, '1m', AVERAGE_VOLATILITY_PERIOD);
      if (klines.length === 0) continue;

      const latestKline = klines[klines.length - 1];
      const timestamp = new Date(latestKline.openTime);

      // 중복 체크
      const existing = await db
        .select()
        .from(chartData)
        .where(and(eq(chartData.asset, asset), eq(chartData.timestamp, timestamp)))
        .limit(1);

      if (existing.length > 0) {
        results[asset] = { chartData: 'skipped', volatilitySnapshot: 'skipped' };
        continue;
      }

      const closePrices = klines.map((k) => k.close);
      const recentPrices = closePrices.slice(-VOLATILITY_LOOKBACK);

      // 변동성 계산
      const currentVolatility = calculateStdDev(recentPrices);
      const averageVolatility = calculateStdDev(closePrices);
      const volatilityChangeRate = calculateVolatilityChangeRate(
        currentVolatility,
        averageVolatility,
      );
      const volatilityScore = calculateVolatilityScore(volatilityChangeRate);

      // 게임성 지표
      const ohlcData = {
        open: latestKline.open,
        high: latestKline.high,
        low: latestKline.low,
        close: latestKline.close,
      };

      const movementIntensity = calculateMovementIntensity(ohlcData);
      const trendStrength = calculateTrendStrength(ohlcData);
      const relativePosition = calculateRelativePosition(ohlcData);
      const rsi = calculateRSI(closePrices);

      // chartData 저장
      const [insertedChartData] = await db
        .insert(chartData)
        .values({
          asset,
          timestamp,
          open: latestKline.open,
          high: latestKline.high,
          low: latestKline.low,
          close: latestKline.close,
          volume: latestKline.volume,
          volatility: currentVolatility,
          averageVolatility,
          volatilityChangeRate,
          volatilityScore,
          movementIntensity,
          trendStrength,
          relativePosition,
          rsi,
        })
        .returning({ id: chartData.id });

      // volatilitySnapshots 계산 및 저장
      const ohlcArray = klines.map((k) => ({
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

      const atr = calculateATR(ohlcArray);
      const bollingerBands = calculateBollingerBands(closePrices);
      const macd = calculateMACD(closePrices);
      const percentChange =
        closePrices.length >= 2
          ? ((closePrices[closePrices.length - 1] - closePrices[0]) / closePrices[0]) * 100
          : 0;

      const [insertedSnapshot] = await db
        .insert(volatilitySnapshots)
        .values({
          asset,
          timestamp,
          stdDev: currentVolatility,
          percentChange,
          atr,
          bollingerUpper: bollingerBands.upper,
          bollingerMiddle: bollingerBands.middle,
          bollingerLower: bollingerBands.lower,
          bollingerBandwidth: bollingerBands.bandwidth,
          macd: macd.macd,
          macdSignal: macd.signal,
          macdHistogram: macd.histogram,
        })
        .returning({ id: volatilitySnapshots.id });

      results[asset] = {
        chartData: insertedChartData.id,
        volatilitySnapshot: insertedSnapshot.id,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        collected: results,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('POST /api/chart/collect error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'COLLECTION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to collect chart data',
        },
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, context: NextContext) {
  try {
    const db = getDbFromContext(context);

    const latestData = await Promise.all(
      TARGET_ASSETS.map(async (asset) => {
        const [latest] = await db
          .select()
          .from(chartData)
          .where(eq(chartData.asset, asset))
          .orderBy(desc(chartData.timestamp))
          .limit(1);

        return { asset, data: latest || null };
      }),
    );

    return NextResponse.json({
      success: true,
      data: { latest: latestData },
    });
  } catch (error) {
    console.error('GET /api/chart/collect error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'Failed to fetch latest data',
        },
      },
      { status: 500 },
    );
  }
}
