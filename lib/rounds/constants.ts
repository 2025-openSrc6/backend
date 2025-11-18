/**
 * Rounds 도메인 상수
 *
 * 하드코딩 방지 및 타입 안전성을 위한 상수 정의.
 * 여러 파일에서 재사용되는 값들을 중앙 관리.
 */

import type { RoundType, RoundStatus, RoundSortField } from './types';

/**
 * 지원하는 라운드 타입 목록
 */
export const ROUND_TYPES: readonly RoundType[] = ['1MIN', '6HOUR', '1DAY'] as const;

export const DEFAULT_ROUND_TYPE: RoundType = '6HOUR';

/**
 * 모든 라운드 상태 목록
 */
export const ROUND_STATUSES: readonly RoundStatus[] = [
  'SCHEDULED',
  'BETTING_OPEN',
  'BETTING_LOCKED',
  'PRICE_PENDING',
  'CALCULATING',
  'SETTLED',
  'CANCELLED',
  'VOIDED',
] as const;

/**
 * 정렬 가능한 필드 목록
 */
export const SORTABLE_FIELDS: readonly RoundSortField[] = ['start_time', 'round_number'] as const;

/**
 * 빠른 검색을 위한 Set
 */
export const ROUND_TYPE_SET = new Set<string>(ROUND_TYPES);
export const ROUND_STATUS_SET = new Set<string>(ROUND_STATUSES);
export const SORTABLE_FIELD_SET = new Set<string>(SORTABLE_FIELDS);

/**
 * 페이지네이션 기본값
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * 정렬 기본값
 */
export const DEFAULT_SORT_FIELD: RoundSortField = 'start_time';
export const DEFAULT_SORT_ORDER = 'desc' as const;

/**
 * 라운드 타입별 지속 시간 (ms)
 */
export const ROUND_DURATIONS_MS: Record<RoundType, number> = {
  '1MIN': 60 * 1000, // 1분
  '6HOUR': 6 * 60 * 60 * 1000, // 6시간
  '1DAY': 24 * 60 * 60 * 1000, // 24시간
} as const;

/**
 * 라운드 타입별 베팅 가능 시간 (ms)
 *
 * 라운드 시작 후 이 시간까지만 베팅 가능
 */
export const BETTING_DURATIONS_MS: Record<RoundType, number> = {
  '1MIN': 10 * 1000, // 10초
  '6HOUR': 60 * 1000, // 1분
  '1DAY': 10 * 60 * 1000, // 10분
} as const;
