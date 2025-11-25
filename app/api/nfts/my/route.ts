import { getDb } from '@/lib/db';
import { achievements } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { NextContext } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: Request, context: NextContext) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return Response.json(
                { error: 'MISSING_USER_ID', message: 'userId 파라미터가 필요합니다' },
                { status: 400 }
            );
        }

        const db = getDb();

        const items = await db
            .select()
            .from(achievements)
            .where(eq(achievements.userId, userId))
            .orderBy(desc(achievements.acquiredAt));

        return Response.json({
            success: true,
            data: {
                items,
            },
        });
    } catch (error) {
        console.error('내 아이템 조회 실패:', error);
        return Response.json(
            { error: 'INTERNAL_SERVER_ERROR', message: '내 아이템을 불러오는데 실패했습니다.' },
            { status: 500 }
        );
    }
}
