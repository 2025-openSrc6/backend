import { getDbFromContext } from '@/lib/db';
import { rounds } from '@/db/schema';
import { NextContext } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/health
 * DB 연결 상태를 확인합니다
 */
export async function GET(request: NextRequest, context: NextContext) {
  try {
    const db = getDbFromContext(context);

    // 간단한 쿼리로 DB 연결 테스트
    await db.select().from(rounds).limit(1);

    return NextResponse.json(
      {
        success: true,
        message: 'Database connection successful',
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Database connection failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
