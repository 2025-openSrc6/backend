/**
 * BetRepository - 베팅 데이터 접근 레이어
 *
 * 책임:
 * - DB 쿼리 생성 (Drizzle ORM)
 * - 트랜잭션 처리 (D1 Batch 사용)
 * - Atomic 업데이트
 * - 실패 시 보상 트랜잭션 (Compensation) 처리
 *
 * D1 Batch 전략:
 * - Interactive Transaction 미지원으로 인해 batch API 사용
 * - 조건 불만족 시 보상 트랜잭션으로 데이터 정합성 보장
 */

import { getDb } from '@/lib/db';
import { bets, rounds, users } from '@/db/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Bet } from '@/db/schema/bets';
import type { Round } from '@/db/schema/rounds';
import type { BetQueryParams, CreateBetInput } from './types';

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

    const baseQuery = db.select().from(bets);
    const queryWithConditions = whereConditions ? baseQuery.where(whereConditions) : baseQuery;

    return queryWithConditions.orderBy(orderByExpression).limit(limit).offset(offset);
  }

  /**
   * 베팅 개수 조회 (페이지네이션용)
   */
  async count(params: BetQueryParams): Promise<number> {
    const db = getDb();
    const whereConditions = this.buildFilters(params.filters);

    const baseQuery = db.select({ count: sql<number>`count(*)` }).from(bets);
    const queryWithConditions = whereConditions ? baseQuery.where(whereConditions) : baseQuery;

    const result = await queryWithConditions;
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
   * D1 Batch 전략:
   * - db.batch()로 3개 쿼리 원자적 실행 (Bet Insert, Round Update, User Update)
   * - 조건 불만족 시 보상 트랜잭션으로 데이터 정합성 보장
   * - Interactive Transaction 미지원으로 인한 D1의 제약사항
   *
   * @param input - 베팅 생성 입력
   * @returns 베팅 생성 결과
   */
  async create(input: CreateBetInput): Promise<{ bet: Bet; round: Round }> {
    const db = getDb();
    const { id, roundId, userId, prediction, amount, createdAt } = input;
    const now = Date.now();

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

      // 결과 분석 및 보상
      // D1 batch 결과: returning()은 배열, 일반 쿼리는 { meta: { changes } } 반환
      const betResult = batchResults[0] as Bet[];
      const roundResult = batchResults[1] as Round[];
      const userUpdateResult = batchResults[2] as { meta?: { changes?: number } };

      const createdBet = betResult[0];
      const updatedRound = roundResult[0];
      const userRowsAffected = userUpdateResult?.meta?.changes ?? 0;

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

      return { bet: createdBet, round: updatedRound };
    } catch (error: unknown) {
      this.handleError(error);
      throw error; // Should be unreachable due to handleError throwing
    }
  }

  private handleError(error: unknown) {
    if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
      const e = new Error('Duplicate bet');
      Object.assign(e, { code: 'ALREADY_EXISTS' });
      throw e;
    }
    throw error;
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
