import { getDb } from '@/lib/db';
import { shopItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextContext } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: Request, context: NextContext) {
    try {
        const db = getDb();

        const items = await db
            .select()
            .from(shopItems)
            .where(eq(shopItems.available, true));

        return Response.json({
            success: true,
            data: {
                items,
            },
        });
    } catch (error) {
        console.error('상점 아이템 조회 실패:', error);
        return Response.json(
            { error: 'INTERNAL_SERVER_ERROR', message: '상점 아이템을 불러오는데 실패했습니다.' },
            { status: 500 }
        );
    }
}
