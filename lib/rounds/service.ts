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
import { getCurrentRoundQuerySchema, getRoundsQuerySchema } from './validation';
import { ValidationError, NotFoundError } from '@/lib/shared/errors';
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

  async getCurrentRound(rawType: unknown): Promise<
    Round & {
      timeRemaining: number;
      bettingTimeRemaining: number;
      goldBetsPercentage: string;
      btcBetsPercentage: string;
      canBet: boolean;
      bettingClosesIn: string;
    }
  > {
    // 1. 입력 검증 (Zod)
    const validated = getCurrentRoundQuerySchema.parse({ type: rawType });
    const type = validated.type as RoundType;

    // 2. Repository 호출 - DB 쿼리
    const round = await this.repository.findCurrentRound(type);
    if (!round) {
      throw new NotFoundError('Current active round', type);
    }

    // UI용 필드 계산
    const now = Math.floor(Date.now() / 1000); // Unix timestamp (초)

    // Date를 Unix timestamp (초)로 변환
    const endTimeSeconds = Math.floor(round.endTime.getTime() / 1000);
    const lockTimeSeconds = Math.floor(round.lockTime.getTime() / 1000);

    // 시간 계산
    const timeRemaining = Math.max(0, endTimeSeconds - now);
    const bettingTimeRemaining = Math.max(0, lockTimeSeconds - now);

    // 베팅 비율 계산
    const totalPool = round.totalPool ?? 0;
    const totalGoldBets = round.totalGoldBets ?? 0;
    const totalBtcBets = round.totalBtcBets ?? 0;

    const goldBetsPercentage =
      totalPool > 0 ? ((totalGoldBets / totalPool) * 100).toFixed(2) : '0.00';
    const btcBetsPercentage =
      totalPool > 0 ? ((totalBtcBets / totalPool) * 100).toFixed(2) : '0.00';

    // 베팅 가능 여부
    const canBet = round.status === 'BETTING_OPEN' && now < lockTimeSeconds;

    // MM:SS 형식 변환
    const bettingClosesIn = this.formatTimeMMSS(bettingTimeRemaining);

    // 5. 결과 반환
    return {
      ...round,
      timeRemaining,
      bettingTimeRemaining,
      goldBetsPercentage,
      btcBetsPercentage,
      canBet,
      bettingClosesIn,
    };
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

  /**
   * 초를 MM:SS 형식으로 변환
   * @private
   */
  private formatTimeMMSS(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}
