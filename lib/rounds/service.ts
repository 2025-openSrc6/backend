/**
 * RoundService - 라운드 비즈니스 로직 레이어
 *
 * 책임:
 * - 입력 검증 (Zod)
 * - 비즈니스 로직 (계산, 판단, 변환)
 * - Repository 조합
 * - 비즈니스 에러 발생
 *
 * 금지 사항:
 * - HTTP 의존성 (NextRequest, NextResponse) ❌
 * - 직접 SQL 작성 ❌
 * - 프레임워크 종속 코드 ❌
 */

import { RoundRepository } from './repository';
import { getRoundsQuerySchema } from './validation';
import { ValidationError, NotFoundError } from '@/lib/shared/errors';
import { STATUS_ALIAS, ROUND_STATUS_SET } from './constants';
import type { GetRoundsResult, RoundStatus, Round, RoundQueryParams, RoundType } from './types';

export class RoundService {
  private repository: RoundRepository;

  constructor(repository?: RoundRepository) {
    // Dependency Injection: 테스트 시 Mock Repository 주입 가능
    this.repository = repository ?? new RoundRepository();
  }

  /**
   * 라운드 목록 조회
   *
   * @param rawParams - 검증되지 않은 쿼리 파라미터
   * @returns 라운드 목록 + 페이지네이션 메타데이터
   *
   * @throws {ValidationError} 입력 검증 실패 시
   *
   * @example
   * const result = await roundService.getRounds({
   *   type: '6HOUR',
   *   statuses: ['BETTING_OPEN', 'BETTING_LOCKED'],
   *   page: 1,
   *   pageSize: 20,
   * });
   */
  async getRounds(rawParams: unknown): Promise<GetRoundsResult> {
    // 1. 입력 검증 (Zod)
    const validated = getRoundsQuerySchema.parse(rawParams);

    // 2. Repository 파라미터 변환
    // Zod에서 이미 타입을 검증했으므로 안전하게 타입 단언
    const queryParams: RoundQueryParams = {
      filters: {
        type: validated.type as RoundType | undefined,
        statuses: validated.statuses as RoundStatus[] | undefined,
      },
      sort: validated.sort as 'start_time' | 'round_number',
      order: validated.order as 'asc' | 'desc',
      limit: validated.pageSize,
      offset: (validated.page - 1) * validated.pageSize,
    };

    // 3. Repository 호출 (병렬 실행)
    const [rounds, total] = await Promise.all([
      this.repository.findMany(queryParams),
      this.repository.count(queryParams),
    ]);

    // 4. 메타데이터 계산
    const totalPages = total > 0 ? Math.ceil(total / validated.pageSize) : 0;

    // 5. 결과 반환
    return {
      rounds,
      meta: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages,
      },
    };
  }

  /**
   * 특정 라운드 조회
   *
   * @param id - 라운드 UUID
   * @returns 라운드 정보
   *
   * @throws {ValidationError} UUID 형식 오류 시
   * @throws {NotFoundError} 라운드가 존재하지 않을 시
   *
   * @example
   * const round = await roundService.getRoundById('uuid-123');
   */
  async getRoundById(id: string): Promise<Round> {
    // 1. UUID 형식 검증 (간단한 정규식)
    if (!this.isValidUuid(id)) {
      throw new ValidationError('Invalid UUID format', { id });
    }

    // 2. Repository 호출
    const round = await this.repository.findById(id);

    // 3. 존재 여부 확인
    if (!round) {
      throw new NotFoundError('Round', id);
    }

    return round;
  }

  /**
   * 상태 별칭 정규화
   *
   * 사용자 입력 (예: 'OPEN')을 정식 상태명 (예: 'BETTING_OPEN')으로 변환
   *
   * @param statusValue - 원본 상태 문자열
   * @returns 정규화된 상태 또는 null
   *
   * @example
   * normalizeStatus('OPEN') // → 'BETTING_OPEN'
   * normalizeStatus('BETTING_OPEN') // → 'BETTING_OPEN'
   * normalizeStatus('INVALID') // → null
   */
  normalizeStatus(statusValue: string): RoundStatus | null {
    const upperValue = statusValue.toUpperCase();
    const normalized = STATUS_ALIAS[upperValue] ?? upperValue;

    return ROUND_STATUS_SET.has(normalized) ? (normalized as RoundStatus) : null;
  }

  /**
   * UUID 형식 검증 (간단한 정규식)
   *
   * @private
   */
  private isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
