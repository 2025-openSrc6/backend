/**
 * BetService - 베팅 비즈니스 로직 레이어
 *
 * 책임:
 * - 입력 검증 (Zod)
 * - 비즈니스 로직 (베팅 가능 여부 판단)
 * - Repository 조합
 * - 비즈니스 에러 발생
 *
 * 금지 사항:
 * - HTTP 의존성 ❌
 * - 직접 SQL 작성 ❌
 */

import { BetRepository } from './repository';
import { RoundRepository } from '@/lib/rounds/repository';
import { createBetSchema, getBetsQuerySchema } from './validation';
import { NotFoundError, BusinessRuleError, ValidationError } from '@/lib/shared/errors';
import { generateUUID, isValidUUID } from '@/lib/shared/uuid';
import type {
  CreateBetResult,
  GetBetsResult,
  BetQueryParams,
  CreateBetInput,
  BetWithRound,
} from './types';
import { Bet } from '@/db/schema';

export class BetService {
  private betRepository: BetRepository;
  private roundRepository: RoundRepository;

  constructor(betRepository?: BetRepository, roundRepository?: RoundRepository) {
    this.betRepository = betRepository ?? new BetRepository();
    this.roundRepository = roundRepository ?? new RoundRepository();
  }

  /**
   * 베팅 생성
   *
   * Validation 3단계:
   * 1. 라운드 상태 확인 (BETTING_OPEN만 허용)
   * 2. 시간 확인 (lockTime 이전만 허용)
   * 3. 유저 잔액 확인 (충분한지 확인 - Repository 레벨에서 Atomic하게 처리됨)
   *
   * @param rawInput - 검증되지 않은 입력
   * @param userId - 인증된 유저 ID
   * @returns 베팅 결과 + 업데이트된 라운드 정보
   */
  async createBet(rawInput: unknown, userId: string): Promise<CreateBetResult> {
    // 1. 입력 검증 (Zod)
    const validated = createBetSchema.parse(rawInput);

    // 2. 라운드 존재 확인
    const round = await this.roundRepository.findById(validated.roundId);
    if (!round) {
      throw new NotFoundError('Round', validated.roundId);
    }

    // 3. 라운드 상태 확인 (Optimistic Check)
    // 실제 데이터 무결성은 Repository의 Atomic Update에서 보장됨
    if (round.status !== 'BETTING_OPEN') {
      throw new BusinessRuleError('BETTING_CLOSED', 'Betting is closed', {
        roundStatus: round.status,
        roundId: round.id,
      });
    }

    // 4. 시간 확인 (이중 안전장치)
    const now = Date.now();
    if (now >= round.lockTime) {
      throw new BusinessRuleError('BETTING_CLOSED', 'Betting time has ended', {
        now,
        lockTime: round.lockTime,
        timeRemaining: round.lockTime - now,
      });
    }

    try {
      // 5. 베팅 생성 (Repository)
      // Repository에서 다음을 Atomic하게 수행:
      // - Bet Insert (Conditional)
      // - Round Pool Update (Conditional)
      // - User Balance Update (Conditional)

      const betId = generateUUID();
      const createdAt = Date.now();

      const betInput: CreateBetInput = {
        id: betId,
        roundId: validated.roundId,
        userId,
        prediction: validated.prediction,
        amount: validated.amount,
        createdAt,
      };

      const { bet, round: updatedRound } = await this.betRepository.create(betInput);

      // 6. 결과 반환
      return {
        bet,
        round: {
          totalPool: updatedRound.totalPool,
          totalGoldBets: updatedRound.totalGoldBets,
          totalBtcBets: updatedRound.totalBtcBets,
          totalBetsCount: updatedRound.totalBetsCount,
        },
        userBalance: {
          delBalance: 0, // TODO: 유저 잔액을 리턴하려면 User 정보도 조회해야 함 (Week 1에서는 생략 or 별도 조회)
        },
      };
    } catch (error: unknown) {
      // Repository 에러를 적절한 비즈니스 에러로 변환
      if (error instanceof Error) {
        if (error.message.includes('Round is not accepting bets')) {
          throw new BusinessRuleError(
            'BETTING_CLOSED',
            'Betting is closed (closed during processing)',
          );
        }
        if (error.message.includes('Insufficient balance')) {
          throw new BusinessRuleError('INSUFFICIENT_BALANCE', 'Insufficient balance');
        }
        // Repository에서 변환된 중복 베팅 에러 처리
        if ((error as { code?: string }).code === 'ALREADY_EXISTS') {
          throw new BusinessRuleError(
            'ALREADY_BET',
            'You have already placed a bet on this round.',
          );
        }
      }
      throw error;
    }
  }

  /**
   * 베팅 목록 조회
   */
  async getBets(rawParams: unknown): Promise<GetBetsResult> {
    // 1. 입력 검증 (Zod)
    const validated = getBetsQuerySchema.parse(rawParams);

    // 2. Repository 파라미터 변환
    const queryParams: BetQueryParams = {
      filters: {
        roundId: validated.roundId,
        userId: validated.userId,
        prediction: validated.prediction,
        resultStatus: validated.resultStatus,
        settlementStatus: validated.settlementStatus,
      },
      sort: validated.sort,
      order: validated.order,
      limit: validated.pageSize,
      offset: (validated.page - 1) * validated.pageSize,
    };

    // 3. Repository 호출
    const bets = await this.betRepository.findMany(queryParams);
    const total = await this.betRepository.count(queryParams);

    // 4. 메타데이터 계산
    const totalPages = total > 0 ? Math.ceil(total / validated.pageSize) : 0;

    // 5. 결과 반환
    return {
      bets,
      meta: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages,
      },
    };
  }

  /**
   * 특정 베팅 조회 (라운드 정보 포함)
   *
   * @param id - 베팅 UUID
   * @returns 베팅 정보 (with Round)
   */
  async getBetById(id: string): Promise<BetWithRound> {
    // 1. UUID 검증
    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid UUID format', { id });
    }

    // 2. 베팅 조회
    const bet = await this.betRepository.findById(id);
    if (!bet) {
      throw new NotFoundError('Bet', id);
    }

    // 3. 라운드 조회
    const round = await this.roundRepository.findById(bet.roundId);
    // 라운드가 없으면 데이터 무결성 문제이나 일단 에러 처리
    if (!round) {
      throw new NotFoundError('Round for bet', bet.roundId);
    }

    return {
      ...bet,
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        type: round.type,
        status: round.status,
        startTime: round.startTime,
        endTime: round.endTime,
      },
    };
  }

  /**
   * 베팅 업데이트 (일반)
   *
   * @param id - 베팅 UUID
   * @param updateData - 업데이트 데이터
   * @returns 업데이트된 베팅
   */
  async updateBet(id: string, updateData: Partial<Bet>): Promise<Bet> {
    return await this.betRepository.updateById(id, updateData);
  }

  /**
   * 베팅 정산 결과 업데이트 (Job 5 전용)
   *
   * 멱등성 보장: 이미 COMPLETED인 베팅은 스킵하도록 호출자가 처리
   *
   * @param betId - 베팅 UUID
   * @param result - 정산 결과
   * @returns 업데이트된 베팅
   */
  async updateBetSettlement(
    betId: string,
    result: {
      resultStatus: 'WON' | 'LOST' | 'REFUNDED';
      settlementStatus: 'COMPLETED' | 'FAILED';
      payoutAmount: number;
    },
  ): Promise<Bet> {
    return this.betRepository.updateById(betId, {
      resultStatus: result.resultStatus,
      settlementStatus: result.settlementStatus,
      payoutAmount: result.payoutAmount,
      settledAt: Date.now(),
    });
  }

  /**
   * 라운드의 모든 베팅 조회 (정산용)
   *
   * @param roundId - 라운드 UUID
   * @returns 베팅 배열
   */
  async findBetsByRoundId(roundId: string): Promise<Bet[]> {
    return this.betRepository.findByRoundId(roundId);
  }
}
