/**
 * D1 데이터베이스에 샘플 데이터를 추가하는 스크립트
 *
 * 사용법: npx tsx scripts/seed.ts
 */

import { drizzle } from 'drizzle-orm/d1';
import Database from 'better-sqlite3';
import { rounds, bets, users } from '../db/schema';

// 로컬 개발 환경에서만 사용 가능
const db = drizzle(new Database('.wrangler/state/d1/DB.sqlite'));

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // 유저 추가
    console.log('\n👤 Adding users...');
    const usersData: (typeof users.$inferInsert)[] = [
      { suiAddress: '0x1111111111111111111111111111111111111111', nickname: 'Alice' },
      { suiAddress: '0x2222222222222222222222222222222222222222', nickname: 'Bob' },
      { suiAddress: '0x3333333333333333333333333333333333333333', nickname: 'Charlie' },
      { suiAddress: '0x4444444444444444444444444444444444444444', nickname: 'Dave' },
    ];
    const insertedUsers = await db.insert(users).values(usersData).returning();
    console.log(`✅ Added ${insertedUsers.length} users`);

    // 라운드 추가
    console.log('\n📝 Adding rounds...');
    const now = new Date();
    const roundsData: (typeof rounds.$inferInsert)[] = [
      {
        roundNumber: 1,
        type: '6HOUR',
        status: 'SCHEDULED',
        startTime: new Date('2025-01-10T10:00:00Z'),
        lockTime: new Date('2025-01-10T10:01:00Z'),
        endTime: new Date('2025-01-10T16:00:00Z'),
        createdAt: now,
        updatedAt: now,
      },
      {
        roundNumber: 2,
        type: '6HOUR',
        status: 'BETTING_OPEN',
        startTime: new Date('2025-01-10T12:00:00Z'),
        lockTime: new Date('2025-01-10T12:01:00Z'),
        endTime: new Date('2025-01-10T18:00:00Z'),
        createdAt: now,
        updatedAt: now,
      },
      {
        roundNumber: 3,
        type: '1DAY',
        status: 'BETTING_LOCKED',
        startTime: new Date('2025-01-09T00:00:00Z'),
        lockTime: new Date('2025-01-09T00:01:00Z'),
        endTime: new Date('2025-01-10T00:00:00Z'),
        createdAt: now,
        updatedAt: now,
      },
    ];

    const insertedRounds = await db.insert(rounds).values(roundsData).returning();
    console.log(`✅ Added ${insertedRounds.length} rounds`);

    // 베팅 추가
    console.log('\n💰 Adding bets...');
    const betsData: (typeof bets.$inferInsert)[] = [
      {
        roundId: insertedRounds[0].id,
        userId: insertedUsers[0].id,
        prediction: 'GOLD',
        amount: 100,
        currency: 'DEL',
        createdAt: now,
      },
      {
        roundId: insertedRounds[0].id,
        userId: insertedUsers[1].id,
        prediction: 'BTC',
        amount: 75,
        currency: 'DEL',
        createdAt: now,
      },
      {
        roundId: insertedRounds[1].id,
        userId: insertedUsers[2].id,
        prediction: 'GOLD',
        amount: 200,
        currency: 'DEL',
        createdAt: now,
      },
      {
        roundId: insertedRounds[2].id,
        userId: insertedUsers[3].id,
        prediction: 'BTC',
        amount: 50,
        currency: 'DEL',
        createdAt: now,
      },
    ];

    const insertedBets = await db.insert(bets).values(betsData).returning();
    console.log(`✅ Added ${insertedBets.length} bets`);

    console.log('\n🎉 Seeding complete!');
    console.log('\n📊 Sample data:');
    console.log('\nRounds:', insertedRounds);
    console.log('\nBets:', insertedBets);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
