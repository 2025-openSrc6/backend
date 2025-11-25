/**
 * RoundRepository - 라운드 데이터 접근 레이어
 *
 * 책임:
 * - DB 쿼리 생성 (Drizzle ORM)
 * - 필터/정렬/페이지네이션 로직
 * - Raw 데이터 반환
 *
 * 금지 사항:
 * - 비즈니스 로직 포함 ❌
 * - 입력 검증 (Service에서 수행) ❌
 * - 데이터 변환 (Service에서 수행) ❌
 */

import { getDb } from '@/lib/db';
import { rounds } from '@/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Round, RoundInsert, RoundQueryParams, RoundStatus, RoundType } from './types';
import { NotFoundError } from '../shared/errors';

export class RoundRepository {
  /**
   * 라운드 목록 조회 (필터/정렬/페이지네이션)
   *
   * @param params - 쿼리 파라미터
   * @returns 라운드 배열
   *
   * @example
   * const rounds = await repo.findMany({
   *   filters: { type: '6HOUR', statuses: ['BETTING_OPEN'] },
   *   sort: 'start_time',
   *   order: 'desc',
   *   limit: 20,
   *   offset: 0,
   * });
   */
  async findMany(params: RoundQueryParams): Promise<Round[]> {
    const db = getDb();
    const { filters, sort, order, limit, offset } = params;

    // 1. 필터 조건 빌드
    const whereConditions = this.buildFilters(filters);

    // 2. 정렬 표현식 결정
    const orderColumn = sort === 'round_number' ? rounds.roundNumber : rounds.startTime;
    const orderByExpression = order === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // 3. 쿼리 실행
    const baseQuery = db.select().from(rounds);
    const query = whereConditions ? baseQuery.where(whereConditions) : baseQuery;

    return query.orderBy(orderByExpression).limit(limit).offset(offset);
  }

  /**
   * 현재 활성 라운드 조회
   *
   * "활성"의 정의: BETTING_OPEN 또는 BETTING_LOCKED 상태
   * 가장 최근에 시작한 라운드를 반환
   *
   * @param type - 라운드 타입
   * @returns 현재 활성 라운드 또는 undefined
   *
   * @example
   * const round = await repo.findCurrentRound('6HOUR');
   */
  async findCurrentRound(type: RoundType): Promise<Round | undefined> {
    const db = getDb();

    const result = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.type, type), inArray(rounds.status, ['BETTING_OPEN', 'BETTING_LOCKED'])))
      .orderBy(desc(rounds.startTime))
      .limit(1);

    return result[0];
  }

  /**
   * 라운드 총 개수 조회 (필터 적용)
   *
   * 페이지네이션을 위한 총 개수 계산
   *
   * @param params - 쿼리 파라미터 (filters만 사용)
   * @returns 총 개수
   */
  async count(params: Pick<RoundQueryParams, 'filters'>): Promise<number> {
    const db = getDb();
    const { filters } = params;

    const whereConditions = this.buildFilters(filters);

    const baseQuery = db.select({ value: sql<number>`count(*)` }).from(rounds);
    const query = whereConditions ? baseQuery.where(whereConditions) : baseQuery;

    const result = await query;
    return result[0]?.value ?? 0;
  }

  /**
   * ID로 라운드 조회
   *
   * @param id - 라운드 UUID
   * @returns 라운드 또는 undefined
   */
  async findById(id: string): Promise<Round | undefined> {
    const db = getDb();
    const result = await db.select().from(rounds).where(eq(rounds.id, id)).limit(1);
    return result[0];
  }

  /**
   * 특정 타입의 마지막 roundNumber 조회
   *
   * @param type - 라운드 타입
   * @returns 마지막 roundNumber 또는 0 (없으면)
   */
  async getLastRoundNumber(type: RoundType): Promise<number> {
    const db = getDb();
    const result = await db
      .select({ roundNumber: rounds.roundNumber })
      .from(rounds)
      .where(eq(rounds.type, type))
      .orderBy(desc(rounds.roundNumber))
      .limit(1);
    return result[0]?.roundNumber ?? 0;
  }

  /**
   * 특정 타입의 중복 시간대 체크
   *
   * 두 구간이 겹치는지 확인:
   * - 기존 라운드: [rounds.startTime, rounds.endTime]
   * - 새 라운드: [startTime, endTime]
   *
   * 겹치는 조건: NOT (완전히 분리됨)
   * - 완전히 분리: (new.end <= old.start) OR (new.start >= old.end)
   * - 겹침: NOT (완전히 분리)
   *
   * @param startTime - 새 라운드 시작 시간 (Epoch milliseconds)
   * @param endTime - 새 라운드 종료 시간 (Epoch milliseconds)
   * @param type - 라운드 타입
   * @returns 중복 시간대 여부
   */
  async checkOverlappingTime(
    startTime: number,
    endTime: number,
    type: RoundType,
  ): Promise<boolean> {
    const db = getDb();

    const result = await db
      .select()
      .from(rounds)
      .where(
        and(
          eq(rounds.type, type),
          sql`NOT (${endTime} <= ${rounds.startTime} OR ${startTime} >= ${rounds.endTime})`,
        ),
      );

    return result.length > 0;
  }

  /**
   * 라운드 삽입
   *
   * @param roundData - 라운드 데이터 (roundNumber 포함)
   * @returns 생성된 라운드
   */
  async insert(roundData: RoundInsert): Promise<Round> {
    const db = getDb();
    const [inserted] = await db.insert(rounds).values(roundData).returning();
    return inserted;
  }

  /**
   * 라운드 업데이트 (ID 기준)
   *
   * @param id - 라운드 UUID
   * @param updateData - 업데이트할 데이터 (Partial<Round>)
   * @returns 업데이트된 라운드
   *
   * @throws {NotFoundError} 라운드가 존재하지 않을 때
   */
  async updateById(id: string, updateData: Partial<Round>): Promise<Round> {
    const db = getDb();

    const result = await db.update(rounds).set(updateData).where(eq(rounds.id, id)).returning();
    if (!result || result.length === 0) {
      throw new NotFoundError('Round', id);
    }
    return result[0];
  }

  /**
   * 타입/시작시각으로 라운드 조회 (idempotent cron 용도)
   */
  async findByStartTime(type: RoundType, startTime: number): Promise<Round | undefined> {
    const db = getDb();
    const result = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.type, type), eq(rounds.startTime, startTime)))
      .limit(1);
    return result[0];
  }

  async findLastRound(type: RoundType): Promise<Round | undefined> {
    const db = getDb();
    const result = await db
      .select()
      .from(rounds)
      .where(eq(rounds.type, type))
      .orderBy(desc(rounds.roundNumber))
      .limit(1);
    return result[0];
  }

  /**
   * 특정 상태의 가장 최근 라운드 1개 조회
   *
   * "가장 최근"의 기준: startTime이 가장 큰 라운드
   *
   * @param status - 라운드 상태
   * @returns 라운드 또는 null
   */
  async findLatestByStatus(status: RoundStatus): Promise<Round | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(rounds)
      .where(eq(rounds.status, status))
      .orderBy(desc(rounds.startTime))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * 필터 조건을 Drizzle WHERE 절로 변환
   *
   * @private
   * @param filters - 필터 객체
   * @returns SQL WHERE 절 또는 undefined
   */
  private buildFilters(filters: RoundQueryParams['filters']): SQL | undefined {
    const conditions: SQL[] = [];

    // type 필터
    if (filters.type) {
      conditions.push(eq(rounds.type, filters.type));
    }

    // statuses 필터 (배열)
    if (filters.statuses && filters.statuses.length > 0) {
      if (filters.statuses.length === 1) {
        // 단일 상태: eq 사용
        conditions.push(eq(rounds.status, filters.statuses[0]));
      } else {
        // 복수 상태: inArray 사용
        conditions.push(inArray(rounds.status, filters.statuses));
      }
    }

    // 조건이 없으면 undefined 반환
    if (conditions.length === 0) {
      return undefined;
    }

    // 조건이 하나면 그대로 반환, 여러 개면 AND로 결합
    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }
}
