/**
 * Rounds 입력 검증 스키마 (Zod)
 *
 * Service Layer에서 입력 검증에 사용.
 * 타입 안전성과 런타임 검증을 동시에 제공.
 */

import { z } from 'zod';
import {
  ROUND_TYPES,
  ROUND_STATUSES,
  SORTABLE_FIELDS,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_SORT_FIELD,
  DEFAULT_SORT_ORDER,
} from './constants';

/**
 * GET /api/rounds 쿼리 파라미터 검증 스키마
 *
 * @example
 * const validated = getRoundsQuerySchema.parse({
 *   type: '6HOUR',
 *   statuses: ['BETTING_OPEN', 'BETTING_LOCKED'],
 *   page: 1,
 *   pageSize: 20,
 * });
 */
export const getRoundsQuerySchema = z.object({
  // 라운드 타입 필터 (선택)
  type: z.enum(ROUND_TYPES as [string, ...string[]]).optional(),

  // 상태 필터 (선택, 배열 가능)
  statuses: z.array(z.enum(ROUND_STATUSES as [string, ...string[]])).optional(),

  // 페이지 번호 (1 이상, 기본값 1)
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(DEFAULT_PAGE),

  // 페이지 크기 (1~100, 기본값 20)
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'Page size must be at least 1')
    .max(MAX_PAGE_SIZE, `Page size must not exceed ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),

  // 정렬 필드 (기본값 start_time)
  sort: z.enum(SORTABLE_FIELDS as [string, ...string[]]).default(DEFAULT_SORT_FIELD),

  // 정렬 순서 (기본값 desc)
  order: z.enum(['asc', 'desc']).default(DEFAULT_SORT_ORDER),
});

/**
 * Zod로 검증된 쿼리 파라미터 타입
 */
export type ValidatedGetRoundsQuery = z.infer<typeof getRoundsQuerySchema>;

/**
 * UUID 검증 스키마
 *
 * GET /api/rounds/:id 등에서 사용
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Unix timestamp 검증 스키마 (초 단위)
 *
 * POST /api/rounds 등에서 사용
 */
export const unixTimestampSchema = z.number().int().positive();

/**
 * GET /api/rounds/current 검증 스키마
 *
 * @example
 * const validated = getCurrentRoundQuerySchema.parse({
 *   type: '6HOUR',
 * });
 */
export const getCurrentRoundQuerySchema = z.object({
  type: z.enum(ROUND_TYPES as [string, ...string[]], {
    message: `type must be one of: ${ROUND_TYPES.join(', ')}`,
  }),
});

export type ValidatedGetCurrentRoundQuery = z.infer<typeof getCurrentRoundQuerySchema>;
