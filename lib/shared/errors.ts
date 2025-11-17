/**
 * 공통 에러 클래스 정의
 *
 * Service Layer에서 발생시키는 모든 에러의 기본 클래스들.
 * HTTP 레이어(Controller)에서 이 에러들을 적절한 HTTP 응답으로 변환함.
 */

/**
 * 모든 Service 에러의 기본 클래스
 *
 * @property code - 에러 코드 (예: 'NOT_FOUND', 'VALIDATION_ERROR')
 * @property message - 사용자에게 표시할 에러 메시지
 * @property details - 추가 디버깅 정보 (선택적)
 */
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * 리소스를 찾을 수 없을 때 발생
 * HTTP 404로 변환됨
 *
 * @example
 * throw new NotFoundError('Round', 'uuid-123');
 * // → "Round not found: uuid-123"
 */
export class NotFoundError extends ServiceError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/**
 * 입력 검증 실패 시 발생 (Zod 검증 실패 등)
 * HTTP 400으로 변환됨
 *
 * @example
 * throw new ValidationError('Invalid page number', { page: -1 });
 */
export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

/**
 * 비즈니스 규칙 위반 시 발생
 * HTTP 400으로 변환됨
 *
 * @example
 * throw new BusinessRuleError(
 *   'BETTING_CLOSED',
 *   '베팅이 마감되었습니다',
 *   { roundStatus: 'BETTING_LOCKED' }
 * );
 */
export class BusinessRuleError extends ServiceError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, details);
    this.name = 'BusinessRuleError';
  }
}

/**
 * 권한 부족 시 발생
 * HTTP 403으로 변환됨
 */
export class ForbiddenError extends ServiceError {
  constructor(message = '권한이 없습니다', details?: unknown) {
    super('FORBIDDEN', message, details);
    this.name = 'ForbiddenError';
  }
}

/**
 * 인증 실패 시 발생
 * HTTP 401로 변환됨
 */
export class UnauthorizedError extends ServiceError {
  constructor(message = '인증이 필요합니다', details?: unknown) {
    super('UNAUTHORIZED', message, details);
    this.name = 'UnauthorizedError';
  }
}
