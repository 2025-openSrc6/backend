// app/api/rankings/route.ts

import { NextResponse } from 'next/server';
import { getRanking } from '@/lib/ranking/service';

/**
 * [GET] /api/rankings
 * -------------------
 * 쿼리:
 *   - ?limit=숫자
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '20') || 20;

  const ranking = await getRanking(limit);

  return NextResponse.json(ranking);
}