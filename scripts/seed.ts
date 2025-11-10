/**
 * D1 데이터베이스에 샘플 데이터를 추가하는 스크립트
 *
 * 사용법: npx tsx scripts/seed.ts
 */

import { drizzle } from "drizzle-orm/d1";
import Database from "better-sqlite3";
import { rounds, bets } from "../db/schema";

// 로컬 개발 환경에서만 사용 가능
const db = drizzle(new Database(".wrangler/state/d1/DB.sqlite"));

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // 라운드 추가
    console.log("\n📝 Adding rounds...");
    const roundsData = [
      {
        roundKey: "round-2025-01-10-1h",
        timeframe: "1h",
        status: "scheduled" as const,
        lockingStartsAt: new Date("2025-01-10T10:00:00Z"),
        lockingEndsAt: new Date("2025-01-10T11:00:00Z"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        roundKey: "round-2025-01-10-6h",
        timeframe: "6h",
        status: "scheduled" as const,
        lockingStartsAt: new Date("2025-01-10T12:00:00Z"),
        lockingEndsAt: new Date("2025-01-10T18:00:00Z"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        roundKey: "round-2025-01-10-1d",
        timeframe: "1d",
        status: "active" as const,
        lockingStartsAt: new Date("2025-01-09T00:00:00Z"),
        lockingEndsAt: new Date("2025-01-10T00:00:00Z"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const insertedRounds = await db.insert(rounds).values(roundsData).returning();
    console.log(`✅ Added ${insertedRounds.length} rounds`);

    // 베팅 추가
    console.log("\n💰 Adding bets...");
    const betsData = [
      {
        roundId: insertedRounds[0].id,
        walletAddress: "0x1111111111111111111111111111111111111111",
        selection: "gold" as const,
        amount: 100.5,
        createdAt: new Date(),
      },
      {
        roundId: insertedRounds[0].id,
        walletAddress: "0x2222222222222222222222222222222222222222",
        selection: "btc" as const,
        amount: 50.25,
        createdAt: new Date(),
      },
      {
        roundId: insertedRounds[1].id,
        walletAddress: "0x3333333333333333333333333333333333333333",
        selection: "gold" as const,
        amount: 200.0,
        createdAt: new Date(),
      },
      {
        roundId: insertedRounds[2].id,
        walletAddress: "0x1111111111111111111111111111111111111111",
        selection: "btc" as const,
        amount: 75.75,
        createdAt: new Date(),
      },
    ];

    const insertedBets = await db.insert(bets).values(betsData).returning();
    console.log(`✅ Added ${insertedBets.length} bets`);

    console.log("\n🎉 Seeding complete!");
    console.log("\n📊 Sample data:");
    console.log("\nRounds:", insertedRounds);
    console.log("\nBets:", insertedBets);

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
