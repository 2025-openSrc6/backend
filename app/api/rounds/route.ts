import { getDbFromContext } from '@/lib/db';
import { rounds } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { NextContext } from '@/lib/types';

/**
 * GET /api/rounds
 * 라운드를 조회합니다 (필터링 및 페이지네이션 지원)
 *
 * @example
 * ```
 * GET /api/rounds?type=6HOUR&status=OPEN&limit=10&offset=0
 * Response: { success: true, data: Round[], pagination: { limit, offset, total } }
 * ```
 */
export async function GET(request: NextRequest, context: NextContext) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type'); // '1MIN', '6HOUR', '1DAY'
    const status = searchParams.get('status'); // 'OPEN', 'CLOSED', 'SCHEDULED'
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const db = getDbFromContext(context);

    // 필터 조건 구성
    const filters = [];
    if (type) {
      filters.push(eq(rounds.type, type));
    }

    if (status) {
      filters.push(eq(rounds.status, status));
    }

    // 쿼리 실행
    const query = db.select().from(rounds);

    const results =
      filters.length > 0
        ? await query
            .where(and(...filters))
            .orderBy(desc(rounds.startTime))
            .limit(limit)
            .offset(offset)
        : await query.orderBy(desc(rounds.startTime)).limit(limit).offset(offset);

    return NextResponse.json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        total: results.length,
      },
    });
  } catch (error) {
    console.error('GET /api/rounds error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
