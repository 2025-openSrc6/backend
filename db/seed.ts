import { getDb } from '@/lib/db';
import { users } from '@/db/schema';

async function main() {
  const db = getDb();
  const now = Date.now();

  // Mock User 생성
  await db
    .insert(users)
    .values({
      id: 'mock-user-id',
      suiAddress: '0x0000000000000000000000000000000000000000', // walletAddress -> suiAddress
      nickname: 'Mock User', // username -> nickname
      // role 필드 없음
      delBalance: 10000, // 초기 잔액
      crystalBalance: 0,
      profileColor: '#3B82F6',
      totalBets: 0,
      totalWins: 0,
      totalVolume: 0,
      attendanceStreak: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  console.log('Mock user seeded!');
}

main().catch(console.error);
