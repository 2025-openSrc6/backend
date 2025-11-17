/**
 * Rounds 도메인 타입 정의
 *
 * DB 스키마(schema.ts)와 별도로 비즈니스 로직에서 사용하는 타입들.
 * Service와 Repository 간 데이터 교환에 사용됨.
 */

import { rounds } from '@/db/schema';

/**
 * 라운드 타입 (베팅 주기)
 */
export type RoundType = '1MIN' | '6HOUR' | '1DAY';

/**
 * 라운드 상태 (FSM 상태)
 *
 * 상태 전이는 FSM.md 참조
 */
export type RoundStatus =
  | 'SCHEDULED' // 생성됨, 시작 대기 중
  | 'BETTING_OPEN' // 베팅 가능
  | 'BETTING_LOCKED' // 베팅 마감, 라운드 진행 중
  | 'PRICE_PENDING' // 종료 가격 대기 중
  | 'CALCULATING' // 정산 계산 중
  | 'SETTLED' // 정산 완료
  | 'CANCELLED' // 취소됨 (환불)
  | 'VOIDED'; // 무효화됨 (무승부)

/**
 * 정렬 가능한 필드
 */
export type RoundSortField = 'start_time' | 'round_number';

/**
 * 정렬 순서
 */
export type SortOrder = 'asc' | 'desc';

/**
 * DB에서 조회한 Round 타입
 */
export type Round = typeof rounds.$inferSelect;

/**
 * Round 생성 시 입력 타입
 */
export type RoundInsert = typeof rounds.$inferInsert;

/**
 * GET /api/rounds 쿼리 파라미터 (파싱 후)
 */
export interface GetRoundsQueryParams {
  type?: RoundType;
  statuses?: RoundStatus[];
  page: number;
  pageSize: number;
  sort: RoundSortField;
  order: SortOrder;
}

/**
 * Repository에서 사용하는 필터 타입
 */
export interface RoundFilters {
  type?: RoundType;
  statuses?: RoundStatus[];
}

/**
 * Repository에서 사용하는 쿼리 파라미터
 */
export interface RoundQueryParams {
  filters: RoundFilters;
  sort: RoundSortField;
  order: SortOrder;
  limit: number;
  offset: number;
}

/**
 * GET /api/rounds 응답 타입 (data 부분)
 */
export interface GetRoundsResult {
  rounds: Round[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
