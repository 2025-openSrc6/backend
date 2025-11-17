import { getDb } from '@/lib/db';
import { bets, users } from '@/db/schema';
import type { NewBet } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/**
 * TODO(ehdnd): 베팅 기능 구현 예정
 */

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
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const roundId = searchParams.get('roundId'); // UUID(string)

    const db = getDb();

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
export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as Partial<NewBet> & {
      walletAddress?: string;
      userAddress?: string;
      selection?: string;
      txDigest?: string;
    };

    const db = getDb();

    // Backward-compatible field mapping
    const providedUserId = raw.userId;
    const userAddress = raw.userAddress ?? raw.walletAddress;
    const prediction = raw.prediction
      ? raw.prediction.toUpperCase()
      : raw.selection
        ? raw.selection.toUpperCase()
        : undefined;
    const suiTxHash = raw.suiTxHash ?? raw.txDigest;

    // Required fields validation
    if (!raw.roundId || prediction === undefined || raw.amount === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: roundId, prediction, amount',
        },
        { status: 400 },
      );
    }

    if (!providedUserId && !userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Either userId or userAddress must be provided',
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

    const userId = await resolveUserId(db, providedUserId, userAddress);

    const result = await db
      .insert(bets)
      .values({
        roundId: raw.roundId,
        userId,
        prediction,
        amount: raw.amount,
        currency: raw.currency ?? 'DEL',
        suiTxHash: suiTxHash || undefined,
        suiBetObjectId: raw.suiBetObjectId,
        settlementStatus: 'PENDING',
        resultStatus: 'PENDING',
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

async function resolveUserId(
  db: ReturnType<typeof getDb>,
  userId?: string,
  userAddress?: string | null,
) {
  if (userId) return userId;
  if (!userAddress) {
    throw new Error('userAddress is required to create a new user');
  }

  const existing = await db.select().from(users).where(eq(users.suiAddress, userAddress)).limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [created] = await db
    .insert(users)
    .values({
      suiAddress: userAddress,
    })
    .returning();

  return created.id;
}
