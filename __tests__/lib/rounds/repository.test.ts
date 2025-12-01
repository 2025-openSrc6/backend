import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { RoundRepository } from '@/lib/rounds/repository';
import * as schema from '@/db/schema';
import type { NewRound } from '@/db/schema';

function getTestDb() {
  const sqlite = new Database(':memory:');
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof getTestDb>;
type SqliteDatabase = InstanceType<typeof Database>;

let testDb: TestDb;
let sqlite: SqliteDatabase;

vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
}));

const createRound = (overrides: Partial<NewRound> = {}): NewRound => ({
  roundNumber: overrides.roundNumber ?? 1,
  type: overrides.type ?? '6HOUR',
  status: overrides.status ?? 'CALCULATING',
  startTime: overrides.startTime ?? 1_000_000,
  endTime: overrides.endTime ?? 1_000_000 + 6_000,
  lockTime: overrides.lockTime ?? 1_000_000 + 1_000,
  startPriceIsFallback: overrides.startPriceIsFallback ?? false,
  endPriceIsFallback: overrides.endPriceIsFallback ?? false,
  totalPool: overrides.totalPool ?? 0,
  totalGoldBets: overrides.totalGoldBets ?? 0,
  totalBtcBets: overrides.totalBtcBets ?? 0,
  totalBetsCount: overrides.totalBetsCount ?? 0,
  platformFeeRate: overrides.platformFeeRate ?? '0.05',
  platformFeeCollected: overrides.platformFeeCollected ?? 0,
  payoutPool: overrides.payoutPool ?? 0,
  createdAt: overrides.createdAt ?? 1_000_000,
  updatedAt: overrides.updatedAt ?? 1_000_000,
  ...overrides,
});

describe('RoundRepository.findStuckCalculatingRounds', () => {
  let repository: RoundRepository;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    testDb = drizzle(sqlite, { schema });
    migrate(testDb, { migrationsFolder: path.join(process.cwd(), 'drizzle') });

    repository = new RoundRepository();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns CALCULATING rounds even when roundEndedAt is null', async () => {
    const threshold = 2_000_000;

    await testDb.insert(schema.rounds).values([
      createRound({
        id: 'round-null-ended',
        roundNumber: 1,
        startTime: 1_000,
        endTime: 2_000,
        lockTime: 1_500,
        roundEndedAt: null,
      }),
      createRound({
        id: 'round-old',
        roundNumber: 2,
        startTime: 3_000,
        endTime: 4_000,
        lockTime: 3_500,
        roundEndedAt: threshold - 500,
      }),
      createRound({
        id: 'round-recent',
        roundNumber: 3,
        startTime: 5_000,
        endTime: 6_000,
        lockTime: 5_500,
        roundEndedAt: threshold + 500,
      }),
      createRound({
        id: 'round-non-calculating',
        roundNumber: 4,
        status: 'SETTLED',
        startTime: 7_000,
        endTime: 8_000,
        lockTime: 7_500,
        roundEndedAt: null,
      }),
    ]);

    const stuck = await repository.findStuckCalculatingRounds(threshold);

    expect(stuck).toHaveLength(2);
    expect(stuck.map((round) => round.id)).toEqual(
      expect.arrayContaining(['round-null-ended', 'round-old']),
    );
  });
});
