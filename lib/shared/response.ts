/**
 * API 응답 생성 유틸리티
 *
 * 모든 API 엔드포인트에서 일관된 응답 포맷을 유지하기 위한 헬퍼 함수들.
 * API_SPECIFICATION.md의 "공통 응답 포맷" 참조.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  ServiceError,
  NotFoundError,
  ValidationError,
  BusinessRuleError,
  ForbiddenError,
  UnauthorizedError,
} from './errors';

/**
 * 성공 응답 생성 (data만)
 *
 * @example
 * return createSuccessResponse({ rounds: [...] });
 * // → { success: true, data: { rounds: [...] } }
 */
export function createSuccessResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status },
  );
}

/**
 * 성공 응답 생성 (data + meta)
 *
 * @example
 * return createSuccessResponseWithMeta(
 *   { rounds: [...] },
 *   { page: 1, pageSize: 20, total: 100, totalPages: 5 }
 * );
 */
export function createSuccessResponseWithMeta<T>(
  data: T,
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  },
  status = 200,
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      meta,
    },
    { status },
  );
}

/**
 * 에러 응답 생성 (수동)
 *
 * @param status - HTTP status code
 * @param code - 에러 코드 (예: 'NOT_FOUND')
 * @param message - 사용자에게 표시할 메시지
 * @param details - 추가 정보 (선택적)
 *
 * @example
 * return createErrorResponse(400, 'INVALID_QUERY', 'Invalid page number');
 */
export function createErrorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

/**
 * 에러 자동 변환 및 응답 생성
 *
 * Service Layer에서 발생한 에러를 적절한 HTTP 응답으로 변환.
 * 모든 API route handler의 catch 블록에서 사용.
 *
 * @example
 * try {
 *   const result = await roundService.getRounds(params);
 *   return createSuccessResponse(result);
 * } catch (error) {
 *   return handleApiError(error);
 * }
 */
export function handleApiError(error: unknown): NextResponse {
  // 개발 환경에서는 전체 스택 출력
  console.error('API Error:', error);

  // 404 - Not Found
  if (error instanceof NotFoundError) {
    return createErrorResponse(404, error.code, error.message, error.details);
  }

  // 400 - Validation Error
  if (error instanceof ValidationError) {
    return createErrorResponse(400, error.code, error.message, error.details);
  }

  // 400 - Business Rule Error
  if (error instanceof BusinessRuleError) {
    return createErrorResponse(400, error.code, error.message, error.details);
  }

  // 403 - Forbidden
  if (error instanceof ForbiddenError) {
    return createErrorResponse(403, error.code, error.message, error.details);
  }

  // 401 - Unauthorized
  if (error instanceof UnauthorizedError) {
    return createErrorResponse(401, error.code, error.message, error.details);
  }

  // 400 - Zod Validation Error
  if (error instanceof ZodError) {
    return createErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input', (error as any).errors);
  }

  // 500 - Unknown Error
  // 프로덕션에서는 상세 에러 메시지 숨김
  const isDevelopment = process.env.NODE_ENV === 'development';
  const message = isDevelopment && error instanceof Error ? error.message : 'Internal server error';

  return createErrorResponse(500, 'INTERNAL_ERROR', message);
}
