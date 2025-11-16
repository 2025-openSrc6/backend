import { NextResponse } from 'next/server';

/**
 * [GET] /api/rankings
 * -------------------
 * 랭킹 데이터를 반환
 */

export async function GET() {
  const mock = [
    { walletAddress: '0xabc...1', totalPnl: 12345.67, winRate: 0.62 },
    { walletAddress: '0xdef...2', totalPnl: 9876.0, winRate: 0.58 },
    { walletAddress: '0xghi...3', totalPnl: 5432.1, winRate: 0.55 },
  ];

  return NextResponse.json(mock);
}
