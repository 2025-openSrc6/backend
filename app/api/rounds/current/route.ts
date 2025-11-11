import { getDbFromContext } from '@/lib/db';
import { rounds } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { NextContext } from '@/lib/types';

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
export async function GET(request: NextRequest, context: NextContext) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') || '6HOUR'; // 기본값 6시간

    // cloudeflare 바인딩이 있어야 동작한다?
    const db = getDbFromContext(context);

    // OPEN 상태이고, 지정된 타입인 라운드 조회
    const currentRound = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.type, type), eq(rounds.status, 'OPEN')))
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
