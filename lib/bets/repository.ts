/**
 * BetRepository - 베팅 데이터 접근 레이어
 *
 * 책임:
 * - DB 쿼리 생성 (Drizzle ORM)
 * - 트랜잭션 처리 (D1 Batch 사용)
 * - Atomic 업데이트
 * - 실패 시 보상 트랜잭션 (Compensation) 처리
 */

import { getDb } from '@/lib/db';
import { bets, rounds, users } from '@/db/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Bet } from '@/db/schema/bets';
import type { Round } from '@/db/schema/rounds';
import type { BetQueryParams, CreateBetInput, BetWithRound } from './types';

// D1 Batch 결과 타입 정의 (Drizzle-ORM internals for SQLite)
interface BatchResult {
  meta: {
    changes: number;
    last_row_id: number;
    changed_db: boolean;
    size_after: number;
    rows_read: number;
    rows_written: number;
  };
  results: unknown[];
}

export class BetRepository {
  /**
   * 베팅 목록 조회 (필터/정렬/페이지네이션)
   */
  async findMany(params: BetQueryParams): Promise<Bet[]> {
    const db = getDb();
    const { filters, sort, order, limit, offset } = params;

    const whereConditions = this.buildFilters(filters);
    const orderColumn = sort === 'amount' ? bets.amount : bets.createdAt;
    const orderByExpression = order === 'asc' ? asc(orderColumn) : desc(orderColumn);

    let query = db.select().from(bets);

    if (whereConditions) {
      query = query.where(whereConditions);
    }

    return query.orderBy(orderByExpression).limit(limit).offset(offset);
  }

  /**
   * 베팅 개수 조회 (페이지네이션용)
   */
  async count(params: BetQueryParams): Promise<number> {
    const db = getDb();
    const whereConditions = this.buildFilters(params.filters);

    let query = db.select({ count: sql<number>`count(*)` }).from(bets);

    if (whereConditions) {
      query = query.where(whereConditions);
    }

    const result = await query;
    return result[0]?.count ?? 0;
  }

  /**
   * ID로 베팅 조회
   */
  async findById(id: string): Promise<Bet | undefined> {
    const db = getDb();
    const result = await db.select().from(bets).where(eq(bets.id, id)).limit(1);
    return result[0];
  }

  /**
   * 베팅 생성 + 라운드 풀 Atomic 업데이트
   *
   * D1은 interactive transaction을 지원하지 않으므로 db.batch()를 사용합니다.
   * 조건 불만족(라운드 마감, 잔액 부족) 시 보상 트랜잭션(Compensation)을 수행하여 정합성을 맞춥니다.
   *
   * @param input - 베팅 생성 입력
   * @returns 베팅 생성 결과
   *
   * @throws 베팅 생성 실패 시 에러
   */
  async create(input: CreateBetInput): Promise<{ bet: Bet; round: Round }> {
    const db = getDb();
    const { id, roundId, userId, prediction, amount, createdAt } = input;
    const now = Date.now();

    // Check if batch is supported (D1 only)
    if (typeof db.batch !== 'function') {
      // console.error('[BetRepo] db.batch is not a function. Adapter:', db);
      throw new Error(
        'Database adapter does not support batch operations (Are you running locally without D1 emulation?)',
      );
    }

    // 1. Batch 준비
    // - Bet Insert
    // - Round Update (조건: status=OPEN)
    // - User Update (조건: balance >= amount)
    try {
      const batchResults = await db.batch([
        // [0] Insert Bet
        db
          .insert(bets)
          .values({
            id,
            roundId,
            userId,
            prediction,
            amount,
            currency: 'DEL',
            resultStatus: 'PENDING',
            settlementStatus: 'PENDING',
            createdAt,
            processedAt: now,
          })
          .returning(),

        // [1] Update Round Pool (Atomic)
        db
          .update(rounds)
          .set({
            totalPool: sql`${rounds.totalPool} + ${amount}`,
            totalGoldBets:
              prediction === 'GOLD'
                ? sql`${rounds.totalGoldBets} + ${amount}`
                : rounds.totalGoldBets,
            totalBtcBets:
              prediction === 'BTC' ? sql`${rounds.totalBtcBets} + ${amount}` : rounds.totalBtcBets,
            totalBetsCount: sql`${rounds.totalBetsCount} + 1`,
            updatedAt: now,
          })
          .where(and(eq(rounds.id, roundId), eq(rounds.status, 'BETTING_OPEN')))
          .returning(),

        // [2] Update User Balance
        db
          .update(users)
          .set({
            delBalance: sql`${users.delBalance} - ${amount}`,
            totalBets: sql`${users.totalBets} + 1`,
            totalVolume: sql`${users.totalVolume} + ${amount}`,
            updatedAt: now,
          })
          .where(and(eq(users.id, userId), sql`${users.delBalance} >= ${amount}`)),
      ]);

      // 2. 결과 분석 및 보상
      const betResult = batchResults[0] as Bet[];
      const roundResult = batchResults[1] as Round[];

      const createdBet = betResult[0];
      const updatedRound = roundResult[0];

      // 2. 결과 분석 및 보상 로직 (Compensation)
      // userRowsAffected를 정확히 가져오기 위해 타입을 다시 캐스팅합니다.
      const userResultAny = batchResults[2] as { meta?: { changes?: number } };
      const userRowsAffected = userResultAny?.meta?.changes ?? 0;

      const errors: string[] = [];

      // Case A: 라운드 마감됨 (Ghost Bet)
      if (!updatedRound) {
        errors.push('Round is not accepting bets');
        // 보상: 베팅 삭제
        await db.delete(bets).where(eq(bets.id, id));
      }

      // Case B: 잔액 부족 (Ghost Bet + Round Pool 잘못 증가)
      if (userRowsAffected === 0) {
        errors.push('Insufficient balance');

        // 보상 1: 베팅 삭제
        await db.delete(bets).where(eq(bets.id, id));

        // 보상 2: 라운드 풀 원복 (만약 라운드 업데이트가 성공했다면)
        if (updatedRound) {
          await db
            .update(rounds)
            .set({
              totalPool: sql`${rounds.totalPool} - ${amount}`,
              totalGoldBets:
                prediction === 'GOLD'
                  ? sql`${rounds.totalGoldBets} - ${amount}`
                  : rounds.totalGoldBets,
              totalBtcBets:
                prediction === 'BTC'
                  ? sql`${rounds.totalBtcBets} - ${amount}`
                  : rounds.totalBtcBets,
              totalBetsCount: sql`${rounds.totalBetsCount} - 1`,
              updatedAt: now,
            })
            .where(eq(rounds.id, roundId));
        }
      }

      if (errors.length > 0) {
        throw new Error(errors.join(', '));
      }

      // 성공
      return { bet: createdBet, round: updatedRound };
    } catch (error: unknown) {
      // DB 에러 처리 (Exception Translation)
      if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
        const e = new Error('Duplicate bet');
        Object.assign(e, { code: 'ALREADY_EXISTS' });
        throw e;
      }
      throw error;
    }
  }

  private buildFilters(filters?: BetQueryParams['filters']): SQL | undefined {
    if (!filters) return undefined;

    const conditions: SQL[] = [];

    if (filters.roundId) conditions.push(eq(bets.roundId, filters.roundId));
    if (filters.userId) conditions.push(eq(bets.userId, filters.userId));
    if (filters.prediction) conditions.push(eq(bets.prediction, filters.prediction));
    if (filters.resultStatus) conditions.push(eq(bets.resultStatus, filters.resultStatus));
    if (filters.settlementStatus)
      conditions.push(eq(bets.settlementStatus, filters.settlementStatus));

    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
