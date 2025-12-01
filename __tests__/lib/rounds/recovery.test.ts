import { RoundService } from '@/lib/rounds/service';
import { BetService } from '@/lib/bets/service';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { Round } from '@/lib/rounds/types';
import { RoundRepository } from '@/lib/rounds/repository';
import { BetRepository } from '@/lib/bets/repository';
import * as fsmModule from '@/lib/rounds/fsm';
import { RETRY_START_THRESHOLD_MS, ALERT_THRESHOLD_MS } from '@/lib/rounds/constants';

// fsm 모듈의 transitionRoundStatus를 spyOn으로 모킹
vi.mock('@/lib/rounds/fsm', async (importOriginal) => {
  const original = await importOriginal<typeof fsmModule>();
  return {
    ...original,
    transitionRoundStatus: vi.fn(),
  };
});

describe('RoundService.recoveryRounds (Job 6)', () => {
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
      roundEndedAt: null, // 기본값 null, 테스트에서 설정
      settlementCompletedAt: null,
      settlementFailureAlertSentAt: null,
      createdAt: NOW - 7 * 60 * 60 * 1000,
      updatedAt: NOW,
      ...overrides,
    }) as Round;

  let mockRoundRepository: {
    findById: Mock;
    updateById: Mock;
    findStuckCalculatingRounds: Mock;
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
      updateById: vi.fn().mockImplementation(async (id, data) => ({ id, ...data })),
      findStuckCalculatingRounds: vi.fn(),
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
  // 1. stuck 라운드가 없으면 빈 결과 반환
  // ============================================
  describe('stuck 라운드가 없을 때', () => {
    it('stuckCount: 0을 반환한다', async () => {
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([]);

      const result = await roundService.recoveryRounds();

      expect(result).toEqual({
        stuckCount: 0,
        retriedCount: 0,
        alertedCount: 0,
      });
    });
  });

  // ============================================
  // 2. 10분~30분 stuck 라운드 → 재시도
  // ============================================
  describe('10분~30분 stuck 라운드', () => {
    it('settleRound()를 호출하고 retriedCount 증가', async () => {
      // 15분 전에 CALCULATING 진입 (10분~30분 범위)
      const stuckRound = createCalculatingRound({
        id: 'round-15min',
        roundEndedAt: NOW - 15 * 60 * 1000,
      });
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([stuckRound]);

      // settleRound 호출 시 필요한 mock
      mockRoundRepository.findById.mockResolvedValue(stuckRound);
      mockBetRepository.findByRoundId.mockResolvedValue([]);
      mockTransition.mockResolvedValue({ ...stuckRound, status: 'SETTLED' });

      const result = await roundService.recoveryRounds();

      expect(result).toEqual({
        stuckCount: 1,
        retriedCount: 1,
        alertedCount: 0,
      });

      // settleRound가 호출되었는지 확인 (findById 호출로 간접 확인)
      expect(mockRoundRepository.findById).toHaveBeenCalledWith('round-15min');
    });

    it('settleRound 실패해도 retriedCount 증가 (다음 분에 재시도)', async () => {
      const stuckRound = createCalculatingRound({
        id: 'round-fail',
        roundEndedAt: NOW - 20 * 60 * 1000,
      });
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([stuckRound]);

      // settleRound 실패 mock
      mockRoundRepository.findById.mockResolvedValue(null); // NotFoundError 유발

      const result = await roundService.recoveryRounds();

      // 실패해도 retriedCount는 증가
      expect(result).toEqual({
        stuckCount: 1,
        retriedCount: 1,
        alertedCount: 0,
      });
    });
  });

  // ============================================
  // 3. 30분 이상 stuck 라운드 → 알림 + 포기
  // ============================================
  describe('30분 이상 stuck 라운드', () => {
    it('settlementFailureAlertSentAt을 기록하고 alertedCount 증가', async () => {
      // 35분 전에 CALCULATING 진입 (30분 초과)
      const stuckRound = createCalculatingRound({
        id: 'round-35min',
        roundEndedAt: NOW - 35 * 60 * 1000,
      });
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([stuckRound]);

      const result = await roundService.recoveryRounds();

      expect(result).toEqual({
        stuckCount: 1,
        retriedCount: 0,
        alertedCount: 1,
      });

      // settlementFailureAlertSentAt 기록 확인
      expect(mockRoundRepository.updateById).toHaveBeenCalledWith('round-35min', {
        settlementFailureAlertSentAt: NOW,
      });

      // settleRound는 호출되지 않음
      expect(mockRoundRepository.findById).not.toHaveBeenCalled();
    });

    it('정확히 30분일 때도 알림 발송', async () => {
      const stuckRound = createCalculatingRound({
        id: 'round-30min-exact',
        roundEndedAt: NOW - ALERT_THRESHOLD_MS, // 정확히 30분
      });
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([stuckRound]);

      const result = await roundService.recoveryRounds();

      expect(result.alertedCount).toBe(1);
      expect(mockRoundRepository.updateById).toHaveBeenCalledWith('round-30min-exact', {
        settlementFailureAlertSentAt: NOW,
      });
    });
  });

  // ============================================
  // 4. 이미 알림 보낸 라운드 → SKIP
  // ============================================
  describe('이미 알림 보낸 라운드', () => {
    it('아무 작업도 하지 않고 SKIP', async () => {
      // 45분 전에 진입, 이미 알림 보냄
      const stuckRound = createCalculatingRound({
        id: 'round-already-alerted',
        roundEndedAt: NOW - 45 * 60 * 1000,
        settlementFailureAlertSentAt: NOW - 15 * 60 * 1000, // 15분 전에 알림 발송됨
      });
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([stuckRound]);

      const result = await roundService.recoveryRounds();

      // 모든 카운트가 0 (stuckCount는 1이지만 실제 처리는 0)
      expect(result).toEqual({
        stuckCount: 1,
        retriedCount: 0,
        alertedCount: 0,
      });

      // 아무 작업도 하지 않음
      expect(mockRoundRepository.updateById).not.toHaveBeenCalled();
      expect(mockRoundRepository.findById).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 5. 여러 라운드 혼합 케이스
  // ============================================
  describe('여러 라운드 혼합 케이스', () => {
    it('각 라운드를 적절히 처리한다', async () => {
      const rounds = [
        // 15분 stuck → 재시도
        createCalculatingRound({
          id: 'round-retry',
          roundNumber: 1,
          roundEndedAt: NOW - 15 * 60 * 1000,
        }),
        // 35분 stuck → 알림
        createCalculatingRound({
          id: 'round-alert',
          roundNumber: 2,
          roundEndedAt: NOW - 35 * 60 * 1000,
        }),
        // 50분 stuck + 이미 알림 → SKIP
        createCalculatingRound({
          id: 'round-skip',
          roundNumber: 3,
          roundEndedAt: NOW - 50 * 60 * 1000,
          settlementFailureAlertSentAt: NOW - 20 * 60 * 1000,
        }),
      ];
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue(rounds);

      // 재시도 대상 라운드용 mock
      mockRoundRepository.findById.mockResolvedValue(rounds[0]);
      mockBetRepository.findByRoundId.mockResolvedValue([]);
      mockTransition.mockResolvedValue({ ...rounds[0], status: 'SETTLED' });

      const result = await roundService.recoveryRounds();

      expect(result).toEqual({
        stuckCount: 3,
        retriedCount: 1, // round-retry
        alertedCount: 1, // round-alert
      });

      // round-alert에 알림 기록
      expect(mockRoundRepository.updateById).toHaveBeenCalledWith('round-alert', {
        settlementFailureAlertSentAt: NOW,
      });

      // round-retry에 settleRound 호출
      expect(mockRoundRepository.findById).toHaveBeenCalledWith('round-retry');
    });
  });

  // ============================================
  // 6. roundEndedAt이 null인 경우
  // ============================================
  describe('roundEndedAt이 null인 경우', () => {
    it('0으로 처리되어 30분 초과로 판정 → 알림', async () => {
      // roundEndedAt이 null이면 stuckDuration = NOW - 0 = NOW (매우 큼)
      const stuckRound = createCalculatingRound({
        id: 'round-null-ended',
        roundEndedAt: null,
      });
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([stuckRound]);

      const result = await roundService.recoveryRounds();

      // NOW - 0 > 30분 이므로 alertedCount 증가
      expect(result.alertedCount).toBe(1);
      expect(mockRoundRepository.updateById).toHaveBeenCalledWith('round-null-ended', {
        settlementFailureAlertSentAt: NOW,
      });
    });
  });

  // ============================================
  // 7. findStuckCalculatingRounds 확인
  // ============================================
  describe('findStuckCalculatingRounds', () => {
    it('올바른 threshold로 repository를 호출한다', async () => {
      mockRoundRepository.findStuckCalculatingRounds.mockResolvedValue([]);

      await roundService.recoveryRounds();

      // RETRY_START_THRESHOLD_MS (10분) 전 시점으로 호출
      const expectedThreshold = NOW - RETRY_START_THRESHOLD_MS;
      expect(mockRoundRepository.findStuckCalculatingRounds).toHaveBeenCalledWith(
        expectedThreshold,
      );
    });
  });
});
