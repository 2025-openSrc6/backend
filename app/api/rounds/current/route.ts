import { getDb } from '@/lib/db';
import { rounds } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

const ACTIVE_STATUSES = ['BETTING_OPEN', 'BETTING_LOCKED', 'PRICE_PENDING', 'CALCULATING'] as const;
const STATUS_ALIAS: Record<string, (typeof ACTIVE_STATUSES)[number]> = {
  OPEN: 'BETTING_OPEN',
  ACTIVE: 'BETTING_OPEN',
  LOCKED: 'BETTING_LOCKED',
};

/**
 * GET /api/rounds/current
 * 현재 활성 라운드를 조회합니다
 *
 * @example
 * ```
 * GET /api/rounds/current?type=6HOUR
 * Response: { success: true, data: Round | null, message?: string }
 * ```
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') || '6HOUR'; // 기본값 6시간
    const statusParam = searchParams.get('status');
    const normalizedStatus = statusParam ? (STATUS_ALIAS[statusParam] ?? statusParam) : undefined;

    const db = getDb();

    // 활성 상태 라운드 또는 명시된 상태 라운드 조회
    const currentRound = await db
      .select()
      .from(rounds)
      .where(
        normalizedStatus
          ? and(eq(rounds.type, type), eq(rounds.status, normalizedStatus))
          : and(eq(rounds.type, type), inArray(rounds.status, ACTIVE_STATUSES)),
      )
      .limit(1);

    if (currentRound.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No active round',
      });
    }

    return NextResponse.json({
      success: true,
      data: currentRound[0],
    });
  } catch (error) {
    console.error('GET /api/rounds/current error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
