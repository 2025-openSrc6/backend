import { getDbFromContext } from '@/lib/db';
import { bets } from '@/db/schema';
import type { NewBet } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { NextContext } from '@/lib/types';

/**
 * GET /api/bets?roundId=1
 * 라운드별 베팅 정보를 조회합니다
 *
 * @example
 * ```
 * GET /api/bets?roundId=1
 * Response: { success: true, data: Bet[] }
 * ```
 */
export async function GET(request: NextRequest, context: NextContext) {
  try {
    const { searchParams } = request.nextUrl;
    const roundId = searchParams.get('roundId'); // UUID(string)

    const db = getDbFromContext(context);

    const allBets = roundId
      ? await db.select().from(bets).where(eq(bets.roundId, roundId))
      : await db.select().from(bets);

    return NextResponse.json(
      {
        success: true,
        data: allBets,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Failed to fetch bets:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/bets
 * 새로운 베팅을 생성합니다
 *
 * @example
 * ```json
 * {
 *   "roundId": 1,
 *   "walletAddress": "0x...",
 *   "selection": "gold",
 *   "amount": 100.5,
 *   "txDigest": "0x..."
 * }
 * ```
 */
export async function POST(request: NextRequest, context: NextContext) {
  try {
    const raw = (await request.json()) as Partial<NewBet> & {
      walletAddress?: string;
      selection?: string;
      txDigest?: string;
    };

    const db = getDbFromContext(context);

    // Backward-compatible field mapping
    const userAddress = raw.userAddress ?? raw.walletAddress;
    const prediction = raw.prediction ?? (raw.selection ? raw.selection.toUpperCase() : undefined);
    const suiTxHash = raw.suiTxHash ?? raw.txDigest;

    // Required fields validation
    if (
      !raw.roundId ||
      !userAddress ||
      prediction === undefined ||
      raw.amount === undefined ||
      !raw.currency
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: roundId, userAddress, prediction, amount, currency',
        },
        { status: 400 },
      );
    }

    // Prediction validation
    if (!['GOLD', 'BTC'].includes(prediction)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid prediction. Must be 'GOLD' or 'BTC'",
        },
        { status: 400 },
      );
    }

    const result = await db
      .insert(bets)
      .values({
        roundId: raw.roundId,
        userAddress,
        prediction,
        amount: raw.amount,
        currency: raw.currency,
        suiTxHash: suiTxHash || undefined,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: result[0],
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to create bet:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
