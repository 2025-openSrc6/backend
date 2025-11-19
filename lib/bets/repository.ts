/**
 * BetRepository - 베팅 데이터 접근 레이어
 *
 * 책임:
 * - DB 쿼리 생성 (Drizzle ORM)
 * - 트랜잭션 처리 (D1 Batch 사용)
 * - Atomic 업데이트
 * - 실패 시 보상 트랜잭션 (Compensation) 처리
 */

import { getDb, type DbClient, type RemoteDrizzleClient, type LocalDrizzleClient } from '@/lib/db';
import { bets, rounds, users } from '@/db/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Bet } from '@/db/schema/bets';
import type { Round } from '@/db/schema/rounds';
import type { BetQueryParams, CreateBetInput } from './types';

export class BetRepository {
  /**
   * 환경 감지 헬퍼
   * db 객체가 batch 메서드를 지원하는지 확인합니다 (D1 vs Local).
   */
  private isD1(db: DbClient): db is RemoteDrizzleClient {
    return 'batch' in db && typeof (db as RemoteDrizzleClient).batch === 'function';
  }

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
   * 전략:
   * 1. D1 환경: db.batch() 사용 (Interactive Tx 불가). 조건 불만족 시 보상 트랜잭션 수행.
   * 2. Local 환경: db.transaction() 사용. 에러 발생 시 자동 롤백.
   *
   * @param input - 베팅 생성 입력
   * @returns 베팅 생성 결과
   */
  async create(input: CreateBetInput): Promise<{ bet: Bet; round: Round }> {
    const db = getDb();

    if (this.isD1(db)) {
      return this.createD1(db, input);
    } else {
      return this.createLocal(db, input);
    }
  }

  /**
   * [Production] D1 환경용 배치 실행
   */
  private async createD1(
    db: RemoteDrizzleClient,
    input: CreateBetInput,
  ): Promise<{ bet: Bet; round: Round }> {
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

  /**
   * [Local/Dev] 로컬 SQLite 환경용 트랜잭션 실행
   */
  private createLocal(db: LocalDrizzleClient, input: CreateBetInput): { bet: Bet; round: Round } {
    const { id, roundId, userId, prediction, amount, createdAt } = input;
    const now = Date.now();

    try {
      // better-sqlite3 transaction은 동기 함수여야 함 (async/await 사용 불가)
      return db.transaction((tx: LocalDrizzleClient) => {
        // 1. Insert Bet
        const betResult = tx
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
          .returning()
          .all();

        const createdBet = betResult[0];

        // 2. Update Round Pool (Atomic)
        const roundResult = tx
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
          .returning()
          .all();

        const updatedRound = roundResult[0];

        if (!updatedRound) {
          throw new Error('Round is not accepting bets');
        }

        // 3. Update User Balance
        const userResult = tx
          .update(users)
          .set({
            delBalance: sql`${users.delBalance} - ${amount}`,
            totalBets: sql`${users.totalBets} + 1`,
            totalVolume: sql`${users.totalVolume} + ${amount}`,
            updatedAt: now,
          })
          .where(and(eq(users.id, userId), sql`${users.delBalance} >= ${amount}`))
          .run();

        // better-sqlite3의 경우 run() 결과에 changes가 포함됨.
        const userRowsAffected = userResult.changes ?? 0;

        if (userRowsAffected === 0) {
          // 로컬에서는 throw하면 전체 트랜잭션이 롤백되므로 보상 트랜잭션 불필요
          throw new Error('Insufficient balance');
        }

        return { bet: createdBet, round: updatedRound };
      });
    } catch (error: unknown) {
      this.handleError(error);
      throw error;
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
