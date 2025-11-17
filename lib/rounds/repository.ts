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
import type { Round, RoundQueryParams } from './types';

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
    let query = db.select().from(rounds);

    if (whereConditions) {
      query = query.where(whereConditions);
    }

    return query.orderBy(orderByExpression).limit(limit).offset(offset);
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

    let query = db.select({ value: sql<number>`count(*)` }).from(rounds);

    if (whereConditions) {
      query = query.where(whereConditions);
    }

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
