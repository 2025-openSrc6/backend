import { RoundService } from '@/lib/rounds/service';
import { BetService } from '@/lib/bets/service';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { Round } from '@/lib/rounds/types';
import type { Bet } from '@/db/schema';
import { RoundRepository } from '@/lib/rounds/repository';
import { BetRepository } from '@/lib/bets/repository';
import * as fsmModule from '@/lib/rounds/fsm';

// fsm 모듈의 transitionRoundStatus를 spyOn으로 모킹
vi.mock('@/lib/rounds/fsm', async (importOriginal) => {
  const original = await importOriginal<typeof fsmModule>();
  return {
    ...original,
    transitionRoundStatus: vi.fn(),
  };
});

describe('RoundService.settleRound', () => {
  const mockTransition = fsmModule.transitionRoundStatus as Mock;

  const NOW = new Date('2025-01-15T09:00:00Z').getTime();

  // CALCULATING 상태의 라운드 mock
  const createCalculatingRound = (overrides: Partial<Round> = {}): Round =>
    ({
      id: '550e8400-e29b-41d4-a716-446655440000',
      roundNumber: 1,
      type: '6HOUR',
      status: 'CALCULATING',
      startTime: NOW - 6 * 60 * 60 * 1000,
      endTime: NOW - 1000,
      lockTime: NOW - 6 * 60 * 60 * 1000 + 60 * 1000,
      totalPool: 1000000,
      totalGoldBets: 600000,
      totalBtcBets: 400000,
      totalBetsCount: 10,
      goldStartPrice: '2650',
      btcStartPrice: '98000',
      goldEndPrice: '2680',
      btcEndPrice: '99000',
      goldChangePercent: '1.13',
      btcChangePercent: '1.02',
      winner: 'GOLD',
      priceSnapshotStartAt: NOW - 6 * 60 * 60 * 1000,
      priceSnapshotEndAt: NOW,
      startPriceSource: 'kitco',
      endPriceSource: 'kitco',
      startPriceIsFallback: false,
      endPriceIsFallback: false,
      startPriceFallbackReason: null,
      endPriceFallbackReason: null,
      suiPoolAddress: null,
      suiSettlementObjectId: null,
      platformFeeRate: '0.05',
      platformFeeCollected: 0,
      payoutPool: 0,
      bettingOpenedAt: NOW - 6 * 60 * 60 * 1000,
      bettingLockedAt: NOW - 6 * 60 * 60 * 1000 + 60 * 1000,
      roundEndedAt: NOW,
      settlementCompletedAt: null,
      createdAt: NOW - 7 * 60 * 60 * 1000,
      updatedAt: NOW,
      ...overrides,
    }) as Round;

  // 베팅 mock 생성 헬퍼
  const createBet = (
    id: string,
    prediction: 'GOLD' | 'BTC',
    amount: number,
    overrides: Partial<Bet> = {},
  ): Bet =>
    ({
      id,
      roundId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'user-' + id,
      prediction,
      amount,
      resultStatus: null,
      settlementStatus: 'PENDING',
      payoutAmount: 0,
      settledAt: null,
      createdAt: NOW - 5 * 60 * 60 * 1000,
      ...overrides,
    }) as Bet;

  let mockRoundRepository: {
    findById: Mock;
    updateById: Mock;
  };
  let mockBetRepository: {
    findByRoundId: Mock;
    updateById: Mock;
  };
  let mockBetService: BetService;
  let roundService: RoundService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    mockRoundRepository = {
      findById: vi.fn(),
      updateById: vi.fn(),
    };

    mockBetRepository = {
      findByRoundId: vi.fn(),
      updateById: vi.fn().mockImplementation(async (id, data) => ({ id, ...data })),
    };

    mockBetService = new BetService(mockBetRepository as unknown as BetRepository);

    roundService = new RoundService(
      mockRoundRepository as unknown as RoundRepository,
      mockBetService,
    );

    mockTransition.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // 1. 라운드가 없으면 에러
  // ============================================
  describe('라운드가 없으면', () => {
    it('NotFoundError를 던진다', async () => {
      mockRoundRepository.findById.mockResolvedValue(null);

      await expect(roundService.settleRound('non-existent-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Round'),
      });
    });
  });

  // ============================================
  // 2. 이미 SETTLED면 멱등성 보장
  // ============================================
  describe('이미 SETTLED 상태면', () => {
    it('already_settled를 반환한다 (멱등성)', async () => {
      const settledRound = createCalculatingRound({
        status: 'SETTLED',
        settlementCompletedAt: NOW - 1000,
      });
      mockRoundRepository.findById.mockResolvedValue(settledRound);

      const result = await roundService.settleRound(settledRound.id);

      expect(result.status).toBe('already_settled');
      expect(result.roundId).toBe(settledRound.id);
      expect(mockTransition).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 3. CALCULATING 아닌 다른 상태면 에러
  // ============================================
  describe('CALCULATING이 아닌 상태면', () => {
    it.each(['SCHEDULED', 'BETTING_OPEN', 'BETTING_LOCKED', 'CANCELLED', 'VOIDED'] as const)(
      '%s 상태일 때 BusinessRuleError를 던진다',
      async (status) => {
        const round = createCalculatingRound({ status });
        mockRoundRepository.findById.mockResolvedValue(round);

        await expect(roundService.settleRound(round.id)).rejects.toMatchObject({
          code: 'INVALID_ROUND_STATUS',
          message: expect.stringContaining(status),
        });
      },
    );
  });

  // ============================================
  // 4. 베팅이 없으면 no_bets 반환
  // ============================================
  describe('베팅이 없으면', () => {
    it('no_bets를 반환하고 SETTLED 전이한다', async () => {
      const round = createCalculatingRound({ totalBetsCount: 0 });
      mockRoundRepository.findById.mockResolvedValue(round);
      mockBetRepository.findByRoundId.mockResolvedValue([]);

      const settledRound = { ...round, status: 'SETTLED' as const };
      mockTransition.mockResolvedValue(settledRound);

      const result = await roundService.settleRound(round.id);

      expect(result.status).toBe('no_bets');
      expect(result.roundId).toBe(round.id);
      expect(mockTransition).toHaveBeenCalledWith(round.id, 'SETTLED', expect.any(Object));
    });
  });

  // ============================================
  // 5. 정상 GOLD 승리 정산
  // ============================================
  describe('GOLD 승리 정산', () => {
    it('승자에게 배당을 지급하고 SETTLED로 전이한다', async () => {
      const round = createCalculatingRound({
        winner: 'GOLD',
        totalPool: 1000000,
        totalGoldBets: 600000,
        totalBtcBets: 400000,
        platformFeeRate: '0.05',
      });
      mockRoundRepository.findById.mockResolvedValue(round);

      // GOLD 베팅 2개, BTC 베팅 2개
      const bets = [
        createBet('bet-1', 'GOLD', 300000), // 승자
        createBet('bet-2', 'GOLD', 300000), // 승자
        createBet('bet-3', 'BTC', 200000), // 패자
        createBet('bet-4', 'BTC', 200000), // 패자
      ];
      mockBetRepository.findByRoundId.mockResolvedValue(bets);

      const settledRound = { ...round, status: 'SETTLED' as const };
      mockTransition.mockResolvedValue(settledRound);
      mockRoundRepository.updateById.mockResolvedValue(settledRound);

      const result = await roundService.settleRound(round.id);

      expect(result.status).toBe('settled');
      expect(result.settledCount).toBe(4); // 승자 2 + 패자 2
      expect(result.totalPayout).toBeDefined();

      // 베팅 업데이트 확인
      expect(mockBetRepository.updateById).toHaveBeenCalledTimes(4);

      // FSM 전이 확인
      expect(mockTransition).toHaveBeenCalledWith(
        round.id,
        'SETTLED',
        expect.objectContaining({
          platformFeeCollected: expect.any(Number),
          settlementCompletedAt: expect.any(Number),
        }),
      );

      // payoutPool 저장 확인
      expect(mockRoundRepository.updateById).toHaveBeenCalledWith(
        round.id,
        expect.objectContaining({ payoutPool: expect.any(Number) }),
      );
    });

    it('배당 계산이 정확하다', async () => {
      const round = createCalculatingRound({
        winner: 'GOLD',
        totalPool: 1000000,
        totalGoldBets: 600000,
        totalBtcBets: 400000,
        platformFeeRate: '0.05',
      });
      mockRoundRepository.findById.mockResolvedValue(round);

      // GOLD에 100,000 베팅한 사람 1명
      const bets = [createBet('bet-1', 'GOLD', 100000)];
      mockBetRepository.findByRoundId.mockResolvedValue(bets);

      const settledRound = { ...round, status: 'SETTLED' as const };
      mockTransition.mockResolvedValue(settledRound);
      mockRoundRepository.updateById.mockResolvedValue(settledRound);

      await roundService.settleRound(round.id);

      // 배당 계산:
      // platformFee = 1000000 * 0.05 = 50000
      // payoutPool = 950000
      // userShare = 100000 / 600000 = 0.1666...
      // payout = floor(0.1666... * 950000) = 158333
      expect(mockBetRepository.updateById).toHaveBeenCalledWith(
        'bet-1',
        expect.objectContaining({
          resultStatus: 'WON',
          settlementStatus: 'COMPLETED',
          payoutAmount: 158333,
        }),
      );
    });
  });

  // ============================================
  // 6. 정상 BTC 승리 정산
  // ============================================
  describe('BTC 승리 정산', () => {
    it('BTC 베팅자에게 배당을 지급한다', async () => {
      const round = createCalculatingRound({
        winner: 'BTC',
        totalPool: 1000000,
        totalGoldBets: 600000,
        totalBtcBets: 400000,
        platformFeeRate: '0.05',
      });
      mockRoundRepository.findById.mockResolvedValue(round);

      // BTC 베팅 1명
      const bets = [
        createBet('bet-1', 'GOLD', 600000), // 패자
        createBet('bet-2', 'BTC', 400000), // 승자
      ];
      mockBetRepository.findByRoundId.mockResolvedValue(bets);

      const settledRound = { ...round, status: 'SETTLED' as const };
      mockTransition.mockResolvedValue(settledRound);
      mockRoundRepository.updateById.mockResolvedValue(settledRound);

      await roundService.settleRound(round.id);

      // BTC 승리 시 배당:
      // payoutPool = 950000
      // userShare = 400000 / 400000 = 1
      // payout = floor(1 * 950000) = 950000
      expect(mockBetRepository.updateById).toHaveBeenCalledWith(
        'bet-2',
        expect.objectContaining({
          resultStatus: 'WON',
          settlementStatus: 'COMPLETED',
          payoutAmount: 950000,
        }),
      );

      // 패자 처리
      expect(mockBetRepository.updateById).toHaveBeenCalledWith(
        'bet-1',
        expect.objectContaining({
          resultStatus: 'LOST',
          settlementStatus: 'COMPLETED',
          payoutAmount: 0,
        }),
      );
    });
  });

  // ============================================
  // 7. 이미 정산된 베팅은 스킵 (멱등성)
  // ============================================
  describe('이미 정산된 베팅 처리', () => {
    it('COMPLETED 상태 베팅은 스킵한다', async () => {
      const round = createCalculatingRound({ winner: 'GOLD' });
      mockRoundRepository.findById.mockResolvedValue(round);

      // 이미 정산된 베팅 1개, 미정산 베팅 1개
      const bets = [
        createBet('bet-1', 'GOLD', 300000, { settlementStatus: 'COMPLETED', resultStatus: 'WON' }),
        createBet('bet-2', 'GOLD', 300000), // 미정산
      ];
      mockBetRepository.findByRoundId.mockResolvedValue(bets);

      const settledRound = { ...round, status: 'SETTLED' as const };
      mockTransition.mockResolvedValue(settledRound);
      mockRoundRepository.updateById.mockResolvedValue(settledRound);

      await roundService.settleRound(round.id);

      // 이미 정산된 베팅은 업데이트되지 않음 (1번만 호출)
      expect(mockBetRepository.updateById).toHaveBeenCalledTimes(1);
      expect(mockBetRepository.updateById).toHaveBeenCalledWith(
        'bet-2',
        expect.objectContaining({ resultStatus: 'WON' }),
      );
    });
  });

  // ============================================
  // 8. 부분 실패 시 partial 반환
  // ============================================
  describe('부분 실패', () => {
    it('일부 베팅 정산 실패 시 partial을 반환한다', async () => {
      const round = createCalculatingRound({ winner: 'GOLD' });
      mockRoundRepository.findById.mockResolvedValue(round);

      const bets = [createBet('bet-1', 'GOLD', 300000), createBet('bet-2', 'GOLD', 300000)];
      mockBetRepository.findByRoundId.mockResolvedValue(bets);

      // 첫 번째 베팅은 성공, 두 번째는 실패
      mockBetRepository.updateById
        .mockResolvedValueOnce({ id: 'bet-1' })
        .mockRejectedValueOnce(new Error('DB Error'));

      const result = await roundService.settleRound(round.id);

      expect(result.status).toBe('partial');
      expect(result.settledCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.message).toContain('Partially settled');

      // FSM 전이는 호출되지 않음 (실패가 있으므로)
      expect(mockTransition).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 9. winner가 null이면 모두 패자 처리
  // ============================================
  describe('winner가 null인 경우', () => {
    it('모든 베팅자가 패자로 처리된다', async () => {
      const round = createCalculatingRound({ winner: null });
      mockRoundRepository.findById.mockResolvedValue(round);
      mockBetRepository.findByRoundId.mockResolvedValue([createBet('bet-1', 'GOLD', 100000)]);

      const settledRound = { ...round, status: 'SETTLED' as const };
      mockTransition.mockResolvedValue(settledRound);
      mockRoundRepository.updateById.mockResolvedValue(settledRound);

      const result = await roundService.settleRound(round.id);

      // winner가 null이면 winningBets가 비어있어서 패자만 처리됨
      expect(result.status).toBe('settled');
      expect(result.totalPayout).toBe(0);
    });
  });
});
