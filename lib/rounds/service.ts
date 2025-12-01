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
import { BetService } from '@/lib/bets/service';
import { createRoundSchema, getCurrentRoundQuerySchema, getRoundsQuerySchema } from './validation';
import {
  ValidationError,
  NotFoundError,
  BusinessRuleError,
  ServiceError,
} from '@/lib/shared/errors';
import { generateUUID, isValidUUID } from '@/lib/shared/uuid';
import type {
  GetRoundsResult,
  RoundStatus,
  Round,
  RoundInsert,
  RoundQueryParams,
  RoundType,
  PriceData,
  OpenRoundResult,
  LockRoundResult,
  FinalizeRoundResult,
  CalculatePayoutResult,
  DetermineWinnerResult,
  SettleRoundResult,
  RecoveryRoundsResult,
} from './types';
import {
  ALERT_THRESHOLD_MS,
  BETTING_DURATIONS_MS,
  RETRY_START_THRESHOLD_MS,
  ROUND_DURATIONS_MS,
} from './constants';
import { transitionRoundStatus } from './fsm';
import { cronLogger } from '@/lib/cron/logger';
import { calculatePayout, determineWinner } from './calculator';

export class RoundService {
  private repository: RoundRepository;
  private betService: BetService;

  constructor(repository?: RoundRepository, betService?: BetService) {
    // Dependency Injection: 테스트 시 Mock 주입 가능
    this.repository = repository ?? new RoundRepository();
    this.betService = betService ?? new BetService();
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
    // 1. UUID 형식 검증 (공통 유틸리티 사용)
    if (!isValidUUID(id)) {
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
    const now = Date.now(); // Epoch milliseconds

    // 시간 계산 (초 단위로 표시, 올림 처리로 더 안전하게)
    const timeRemaining = Math.max(0, Math.ceil((round.endTime - now) / 1000));
    const bettingTimeRemaining = Math.max(0, Math.ceil((round.lockTime - now) / 1000));

    // 베팅 비율 계산
    const totalPool = round.totalPool ?? 0;
    const totalGoldBets = round.totalGoldBets ?? 0;
    const totalBtcBets = round.totalBtcBets ?? 0;

    const goldBetsPercentage =
      totalPool > 0 ? ((totalGoldBets / totalPool) * 100).toFixed(2) : '0.00';
    const btcBetsPercentage =
      totalPool > 0 ? ((totalBtcBets / totalPool) * 100).toFixed(2) : '0.00';

    // 베팅 가능 여부
    const canBet = round.status === 'BETTING_OPEN' && now < round.lockTime;

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
   * 새 라운드 생성 (Admin 전용)
   *
   * Service에서 다음 작업 수행:
   * - 입력 검증 (Zod)
   * - endTime, lockTime 자동 계산
   * - roundNumber 자동 증가
   * - 중복 시간대 체크
   * - DB 삽입 (트랜잭션)
   *
   * @param rawParams - 검증되지 않은 입력 파라미터
   * @returns 생성된 라운드
   *
   * @throws {ValidationError} 입력 검증 실패 시
   * @throws {BusinessRuleError} 비즈니스 규칙 위반 시 (중복 시간대 등)
   * @throws {ServiceError} DB 오류 등
   */
  async createRound(rawParams: unknown): Promise<Round> {
    // 1. 입력 검증 (Zod)
    const validated = createRoundSchema.parse(rawParams);

    // 2. 시간 계산
    const startTime = validated.startTime;
    const type = validated.type as RoundType;

    // [개발용 임시] cron job 구현 후 status 제거
    const status = validated.status as RoundStatus | undefined;

    const endTime = startTime + ROUND_DURATIONS_MS[type];
    const lockTime = startTime + BETTING_DURATIONS_MS[type];

    // 3. 중복 체크 + roundNumber 증가 + 삽입
    // 주의: 트랜잭션 지원 안함

    try {
      // 3-1. 중복 시간대 체크
      const isOverlapping = await this.repository.checkOverlappingTime(startTime, endTime, type);
      if (isOverlapping) {
        throw new BusinessRuleError(
          'ROUND_TIME_OVERLAP',
          'A round already exists for this time period',
          {
            type,
            startTime,
            endTime,
          },
        );
      }

      // 3-2. 마지막 roundNumber 조회
      const lastRoundNumber = await this.repository.getLastRoundNumber(type);
      const roundNumber = lastRoundNumber + 1;

      // 3-3. 라운드 객체 생성
      const roundData: RoundInsert = {
        id: generateUUID(),
        roundNumber,
        type,
        status: status ?? 'SCHEDULED',
        startTime,
        endTime,
        lockTime,
        // 나머지 필드는 기본값 (생략)
      };

      // 3-4. 라운드 삽입
      return await this.repository.insert(roundData);
    } catch (error) {
      // 비즈니스 에러는 그대로 재발생
      if (error instanceof BusinessRuleError || error instanceof ValidationError) {
        throw error;
      }

      // DB 에러를 ServiceError로 변환
      if (error instanceof Error) {
        // UNIQUE constraint 위반 등
        if (error.message.includes('UNIQUE') || error.message.includes('unique')) {
          throw new BusinessRuleError('ROUND_ALREADY_EXISTS', 'Round already exists', {
            originalError: error.message,
          });
        }

        // 기타 DB 에러
        throw new ServiceError('DATABASE_ERROR', 'Failed to create round', {
          originalError: error.message,
        });
      }

      // 알 수 없는 에러
      throw error;
    }
  }

  /**
   * 라운드 상태 업데이트
   *
   * @param roundId 라운드 ID
   * @param status 새로운 상태
   * @param metadata 추가 업데이트 데이터 (선택)
   * @returns 업데이트된 라운드
   */
  async updateRoundById(roundId: string, updateData: Partial<Round>): Promise<Round> {
    return await this.repository.updateById(roundId, updateData);
  }

  /**
   * 다음 라운드 생성
   * @returns 생성된 라운드
   */
  async createNextScheduledRound(): Promise<Round> {
    const type: RoundType = '6HOUR';
    const lastRound = await this.repository.findLastRound(type);

    let roundNumber: number;
    let startTime: number;

    if (!lastRound) {
      // 첫 라운드: KST 02/08/14/20시에 맞춘 6시간 슬롯으로 올림
      startTime = this.getNextAnchoredStartTime(Date.now());
      roundNumber = 1;
    } else {
      startTime = lastRound.startTime + ROUND_DURATIONS_MS[type];
      roundNumber = lastRound.roundNumber + 1;
    }

    // 중복 체크
    const existing = await this.repository.findByStartTime(type, startTime);
    if (existing) {
      return existing;
    }

    const endTime = startTime + ROUND_DURATIONS_MS[type];
    const lockTime = startTime + BETTING_DURATIONS_MS[type];
    const now = Date.now();

    const roundData: RoundInsert = {
      id: generateUUID(),
      roundNumber,
      type,
      status: 'SCHEDULED',
      startTime,
      endTime,
      lockTime,
      createdAt: now,
      updatedAt: now,
    };

    return await this.repository.insert(roundData);
  }

  /**
   * 가장 최근 SCHEDULED 라운드 1개 찾기
   *
   * 왜 "모든 SCHEDULED"가 아닌 "가장 최근 1개"인가?
   * - 정상 상황: 항상 1개만 존재
   * - 비정상 상황: 이전 라운드가 밀려있으면 CANCEL 대상
   */
  async findLatestScheduledRound(): Promise<Round | null> {
    return await this.repository.findLatestByStatus('SCHEDULED');
  }

  /**
   * 라운드 취소 (FSM 래핑)
   *
   * 취소는 여러 곳에서 호출되므로 Service에서 래핑
   */
  async cancelRound(
    roundId: string,
    params: {
      reason: string;
      message: string;
      cancelledBy: 'SYSTEM' | 'ADMIN';
    },
  ): Promise<Round> {
    return transitionRoundStatus(roundId, 'CANCELLED', {
      cancellationReason: params.reason,
      cancellationMessage: params.message,
      cancelledBy: params.cancelledBy,
      cancelledAt: Date.now(),
    });
  }

  /**
   * 라운드 오픈 (Job 2: Round Opener)
   *
   * 책임:
   * 1. 가장 최근 SCHEDULED 라운드 찾기
   * 2. 시간 검증 (startTime <= now < lockTime)
   * 3. 상태 전이 (SCHEDULED → BETTING_OPEN) - FSM 호출
   * 4. lockTime 경과 시 자동 취소
   *
   * @param prices - 외부 API에서 가져온 가격 데이터
   * @returns OpenRoundResult
   */
  async openRound(prices: PriceData): Promise<OpenRoundResult> {
    cronLogger.info('[Job 2] Starting', { prices });

    // 가장 최근 SCHEDULED 라운드 찾기
    const round = await this.findLatestScheduledRound();
    if (!round) {
      cronLogger.info('[Job 2] No scheduled round found');
      return { status: 'no_round', message: 'No scheduled round found' };
    }

    cronLogger.info('[Job 2] Found round', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      startTime: new Date(round.startTime).toISOString(),
      lockTime: new Date(round.lockTime).toISOString(),
    });

    const now = Date.now();

    // startTime 아직 안 됐으면 스킵
    if (round.startTime > now) {
      cronLogger.info('[Job 2] Round not ready yet', {
        roundId: round.id,
        startTime: new Date(round.startTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      return {
        status: 'not_ready',
        round,
        message: 'Round not ready yet (startTime not reached)',
      };
    }

    // lockTime 이미 지났으면 CANCEL (복구 안함)
    if (now >= round.lockTime) {
      cronLogger.warn('[Job 2] lockTime passed, cancelling', {
        roundId: round.id,
        lockTime: new Date(round.lockTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      const cancelledRound = await this.cancelRound(round.id, {
        reason: 'MISSED_OPEN_WINDOW',
        message: 'lockTime 경과로 자동 취소',
        cancelledBy: 'SYSTEM',
      });
      cronLogger.info('[Job 2] Round cancelled', { roundId: round.id });
      return {
        status: 'cancelled',
        round: cancelledRound,
        message: 'Round cancelled (missed open window)',
      };
    }

    // 상태 전이 (SCHEDULED → BETTING_OPEN)
    cronLogger.info('[Job 2] Transitioning to BETTING_OPEN', {
      roundId: round.id,
    });
    const openedRound = await transitionRoundStatus(round.id, 'BETTING_OPEN', {
      goldStartPrice: prices.gold.toString(),
      btcStartPrice: prices.btc.toString(),
      priceSnapshotStartAt: prices.timestamp,
      startPriceSource: prices.source,
      bettingOpenedAt: Date.now(),
    });

    cronLogger.info('[Job 2] Success', {
      roundId: openedRound.id,
      status: openedRound.status,
    });

    return {
      status: 'opened',
      round: openedRound,
    };
  }

  async lockRound(): Promise<LockRoundResult> {
    cronLogger.info('[Job 3] Starting');

    const round = await this.repository.findLatestByStatus('BETTING_OPEN');
    if (!round) {
      cronLogger.info('[Job 3] No open round found');
      return { status: 'no_round', message: 'No open round found' };
    }

    cronLogger.info('[Job 3] Found round', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      lockTime: new Date(round.lockTime).toISOString(),
    });

    // 시간 조건
    const now = Date.now();
    if (round.lockTime > now) {
      cronLogger.info('[Job 3] Round not ready to lock yet', {
        roundId: round.id,
        lockTime: new Date(round.lockTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      return { status: 'not_ready', round, message: 'Round not ready to lock yet' };
    }

    cronLogger.info('[Job 3] Transitioning to BETTING_LOCKED', {
      roundId: round.id,
    });
    const lockedRound = await transitionRoundStatus(round.id, 'BETTING_LOCKED', {
      bettingLockedAt: Date.now(),
    });

    cronLogger.info('[Job 3] Success', {
      roundId: lockedRound.id,
      status: lockedRound.status,
    });

    return {
      status: 'locked',
      round: lockedRound,
    };
  }

  async finalizeRound(endPriceData: PriceData): Promise<FinalizeRoundResult> {
    const jobStartTime = Date.now();
    cronLogger.info('[Job 4] Starting', { jobStartTime });

    try {
      // 가장 최근 BETTING_LOCKED 라운드 1개 찾기
      const round = await this.repository.findLatestByStatus('BETTING_LOCKED');
      if (!round) {
        cronLogger.info('[Job 4] No locked round found');
        return { status: 'no_round', message: 'No locked round found' };
      }

      cronLogger.info('[Job 4] Found round', {
        roundId: round.id,
        roundNumber: round.roundNumber,
        endTime: new Date(round.endTime).toISOString(),
        now: new Date(Date.now()).toISOString(),
      });

      // 시간 조건
      const now = Date.now();
      if (round.endTime > now) {
        cronLogger.info('[Job 4] Round not ready to finalize yet', {
          roundId: round.id,
          endTime: new Date(round.endTime).toISOString(),
          now: new Date(now).toISOString(),
        });
        return { status: 'not_ready', round, message: 'Round not ready to finalize yet' };
      }

      // 필수 필드 검증 (fail fast)
      const missingFields: string[] = [];
      if (!round.goldStartPrice) missingFields.push('goldStartPrice');
      if (!round.btcStartPrice) missingFields.push('btcStartPrice');
      if (round.totalPool === null || round.totalPool === undefined)
        missingFields.push('totalPool');
      if (round.totalGoldBets === null || round.totalGoldBets === undefined) {
        missingFields.push('totalGoldBets');
      }
      if (round.totalBtcBets === null || round.totalBtcBets === undefined) {
        missingFields.push('totalBtcBets');
      }

      if (missingFields.length > 0) {
        throw new BusinessRuleError('ROUND_DATA_MISSING', 'Missing required round fields', {
          roundId: round.id,
          missing: missingFields,
        });
      }

      // 승자 판정
      const winnerResult: DetermineWinnerResult = determineWinner({
        goldStart: parseFloat(round.goldStartPrice!),
        goldEnd: endPriceData.gold,
        btcStart: parseFloat(round.btcStartPrice!),
        btcEnd: endPriceData.btc,
      });

      cronLogger.info('[Job 4] Winner determined', {
        roundId: round.id,
        winner: winnerResult.winner,
        goldChangePercent: winnerResult.goldChangePercent,
        btcChangePercent: winnerResult.btcChangePercent,
      });

      // 배당 계산
      const payoutResult: CalculatePayoutResult = calculatePayout({
        winner: winnerResult.winner,
        totalPool: round.totalPool!,
        totalGoldBets: round.totalGoldBets!,
        totalBtcBets: round.totalBtcBets!,
        platformFeeRate: 0.05,
      });

      cronLogger.info('[Job 4] Payout calculated', {
        roundId: round.id,
        payoutResult,
      });

      // 상태 전이 (BETTING_LOCKED → CALCULATING)
      const calculatingRound = await transitionRoundStatus(round.id, 'CALCULATING', {
        roundEndedAt: Date.now(),
        goldEndPrice: endPriceData.gold.toString(),
        btcEndPrice: endPriceData.btc.toString(),
        priceSnapshotEndAt: endPriceData.timestamp,
        endPriceSource: endPriceData.source,
        winner: winnerResult.winner,
        goldChangePercent: winnerResult.goldChangePercent.toString(),
        btcChangePercent: winnerResult.btcChangePercent.toString(),
      });

      cronLogger.info('[Job 4] Transitioned to CALCULATING', {
        roundId: round.id,
      });

      // Job 5 트리거 (내부 호출 - 실제 정산 구현 필요)
      await this.settleRound(calculatingRound.id);

      const jobDuration = Date.now() - jobStartTime;
      cronLogger.info('[Job 4] Completed', {
        roundId: round.id,
        roundNumber: round.roundNumber,
        winner: winnerResult.winner,
        durationMs: jobDuration,
      });

      return { status: 'finalized', round: calculatingRound };
    } catch (error) {
      const jobDuration = Date.now() - jobStartTime;
      cronLogger.error('[Job 4] Failed', {
        durationMs: jobDuration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ServiceError || error instanceof BusinessRuleError) {
        throw error;
      }

      throw new ServiceError('INTERNAL_ERROR', 'Failed to finalize round', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async settleRound(roundId: string): Promise<SettleRoundResult> {
    const jobStartTime = Date.now();
    cronLogger.info('[Job 5] Starting settlement', { roundId });

    try {
      // 1. 라운드 조회
      const round = await this.repository.findById(roundId);
      if (!round) {
        throw new NotFoundError('Round', roundId);
      }

      // 2. 멱등성: 이미 SETTLED면 성공으로 처리
      if (round.status === 'SETTLED') {
        cronLogger.info('[Job 5] Round already settled', { roundId });
        return { status: 'already_settled', roundId };
      }

      // 3. 상태 검증
      if (round.status !== 'CALCULATING') {
        throw new BusinessRuleError(
          'INVALID_ROUND_STATUS',
          `Round must be in CALCULATING status, got: ${round.status}`,
          { roundId, currentStatus: round.status },
        );
      }

      // 4. 베팅 조회
      const allBets = await this.betService.findBetsByRoundId(roundId);

      // 5. 베팅 없으면 바로 SETTLED 전이
      if (allBets.length === 0) {
        cronLogger.info('[Job 5] No bets to settle', { roundId });

        await transitionRoundStatus(roundId, 'SETTLED', {
          platformFeeCollected: 0,
          settlementCompletedAt: Date.now(),
        });

        return { status: 'no_bets', roundId, settledCount: 0 };
      }

      // 6. 수수료 및 payoutPool 계산
      const platformFee = Math.floor(round.totalPool * parseFloat(round.platformFeeRate));
      const payoutPool = round.totalPool - platformFee;

      cronLogger.info('[Job 5] Payout calculated', {
        roundId,
        totalPool: round.totalPool,
        platformFee,
        payoutPool,
      });

      // 7. 승자/패자 분류
      const winningBets = allBets.filter((bet) => bet.prediction === round.winner);
      const losingBets = allBets.filter((bet) => bet.prediction !== round.winner);
      const winningPool = round.winner === 'GOLD' ? round.totalGoldBets : round.totalBtcBets;

      cronLogger.info('[Job 5] Bets classified', {
        roundId,
        winners: winningBets.length,
        losers: losingBets.length,
        winningPool,
      });

      // 8. 승자 정산
      let settledCount = 0;
      let failedCount = 0;
      let totalPayout = 0;

      for (const bet of winningBets) {
        try {
          // 멱등성: 이미 정산된 베팅 스킵
          if (bet.settlementStatus === 'COMPLETED') {
            settledCount++;
            continue;
          }

          // 배당 계산
          const userShare = bet.amount / winningPool;
          const payout = Math.floor(userShare * payoutPool);

          // DB 업데이트
          await this.betService.updateBetSettlement(bet.id, {
            resultStatus: 'WON',
            settlementStatus: 'COMPLETED',
            payoutAmount: payout,
          });

          settledCount++;
          totalPayout += payout;
        } catch (error) {
          cronLogger.error('[Job 5] Failed to settle winning bet', {
            betId: bet.id,
            error: error instanceof Error ? error.message : String(error),
          });
          failedCount++;
        }
      }

      // 9. 패자 처리
      for (const bet of losingBets) {
        try {
          // 멱등성: 이미 처리된 베팅 스킵
          if (bet.settlementStatus === 'COMPLETED') {
            continue;
          }

          await this.betService.updateBetSettlement(bet.id, {
            resultStatus: 'LOST',
            settlementStatus: 'COMPLETED',
            payoutAmount: 0,
          });
        } catch (error) {
          cronLogger.error('[Job 5] Failed to update losing bet', {
            betId: bet.id,
            error: error instanceof Error ? error.message : String(error),
          });
          // 패자 처리 실패는 카운트하지 않음 (돈이 안 걸려있음)
        }
      }

      // 10. 라운드 상태 업데이트
      if (failedCount === 0) {
        // 정산 완료
        await transitionRoundStatus(roundId, 'SETTLED', {
          platformFeeCollected: platformFee,
          settlementCompletedAt: Date.now(),
        });

        // payoutPool도 저장
        await this.repository.updateById(roundId, { payoutPool });

        const jobDuration = Date.now() - jobStartTime;
        cronLogger.info('[Job 5] Completed', {
          roundId,
          settledCount,
          totalPayout,
          durationMs: jobDuration,
        });

        return {
          status: 'settled',
          roundId,
          settledCount: settledCount + losingBets.length,
          totalPayout,
        };
      } else {
        // 부분 실패 → Recovery에서 재시도
        const jobDuration = Date.now() - jobStartTime;
        cronLogger.warn('[Job 5] Partially settled', {
          roundId,
          settledCount,
          failedCount,
          durationMs: jobDuration,
        });

        return {
          status: 'partial',
          roundId,
          settledCount,
          failedCount,
          message: 'Partially settled, will retry in Recovery',
        };
      }
    } catch (error) {
      const jobDuration = Date.now() - jobStartTime;
      cronLogger.error('[Job 5] Failed to settle round', {
        roundId,
        durationMs: jobDuration,
        error: error instanceof Error ? error.message : String(error),
      });

      // TODO: Slack 알림

      throw error;
    }
  }

  /**
   * Recovery Job 메인 로직 (Job 6)
   *
   * 단순하게:
   * 1. stuck 라운드 찾기 (CALCULATING + 10분 이상)
   * 2. 각각에 대해 settleRound() 호출 또는 알림
   * 3. 숫자만 반환
   *
   * @returns RecoveryRoundsResult - stuckCount, retriedCount, alertedCount
   */
  async recoveryRounds(): Promise<RecoveryRoundsResult> {
    // TODO: 구현 필요
    // 1. findStuckCalculatingRounds() 호출
    // 2. 각 라운드에 대해:
    //    - 30분 이상 경과 → Slack CRITICAL 알림, alertedCount++
    //    - 10분~30분 → 재시도, retriedCount++
    // 3. 결과 반환

    const stuckRounds = await this.findStuckCalculatingRounds();
    if (stuckRounds.length === 0) {
      cronLogger.info('[Job 6] No stuck rounds found');
      return { stuckCount: 0, retriedCount: 0, alertedCount: 0 };
    }

    const now = Date.now();

    let retriedCount = 0;
    let alertedCount = 0;

    for (const stuckRound of stuckRounds) {
      // 이미 알림 보냈으면 스킵
      if (stuckRound.settlementFailureAlertSentAt) {
        cronLogger.info('[Job 6] Alert already sent, skipping', {
          roundId: stuckRound.id,
          alertSentAt: new Date(stuckRound.settlementFailureAlertSentAt).toISOString(),
        });
        continue;
      }

      const stuckDuration = now - (stuckRound.roundEndedAt ?? 0);
      if (stuckDuration >= ALERT_THRESHOLD_MS) {
        cronLogger.error('[Job 6] 30min threshold exceeded, sending alert', {
          roundId: stuckRound.id,
          roundNumber: stuckRound.roundNumber,
          stuckMinutes: Math.floor(stuckDuration / 60000),
        });

        // TODO(ehdnd): slack alert

        await this.repository.updateById(stuckRound.id, {
          settlementFailureAlertSentAt: now,
        });

        ++alertedCount;
        continue;
      }

      // 재시도 시작
      cronLogger.info('[Job 6] Retrying settlement', {
        roundId: stuckRound.id,
        stuckMinutes: Math.floor(stuckDuration / 60000),
      });

      ++retriedCount;
      try {
        await this.settleRound(stuckRound.id);
      } catch (error) {
        cronLogger.warn('[Job 6] Failed to settle round, will retry next minute', {
          roundId: stuckRound.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { stuckCount: stuckRounds.length, retriedCount, alertedCount };
  }

  /**
   * CALCULATING 상태 + roundEndedAt이 threshold 이전인 라운드 찾기
   *
   * @returns stuck 라운드 배열
   */
  async findStuckCalculatingRounds(): Promise<Round[]> {
    const threshold = Date.now() - RETRY_START_THRESHOLD_MS;
    return this.repository.findStuckCalculatingRounds(threshold);
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

  /**
   * KST 02/08/14/20시 슬롯을 기준으로 다음 시작 시각을 계산
   */
  private getNextAnchoredStartTime(nowMs: number): number {
    const intervalMs = ROUND_DURATIONS_MS['6HOUR']; // 6시간
    const anchorOffsetMs = 5 * 60 * 60 * 1000; // 05:00 UTC == 14:00 KST → hour % 6 === 5
    const slots = Math.ceil((nowMs - anchorOffsetMs) / intervalMs);
    return slots * intervalMs + anchorOffsetMs;
  }
}
