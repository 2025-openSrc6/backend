import { getDbFromContext } from '@/lib/db';
import { rounds } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(request: Request, context: any) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // '1MIN', '6HOUR', '1DAY'
    const status = searchParams.get('status'); // 'OPEN', 'COMPLETED', etc.
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
            .orderBy(desc(rounds.start_time))
            .limit(limit)
            .offset(offset)
        : await query.orderBy(desc(rounds.start_time)).limit(limit).offset(offset);

    return Response.json({
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
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
