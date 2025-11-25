import { RoundService } from '@/lib/rounds/service';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { RoundType, Round, RoundInsert, PriceData } from '@/lib/rounds/types';
import { RoundRepository } from '@/lib/rounds/repository';
import * as fsmModule from '@/lib/rounds/fsm';

// fsm 모듈의 transitionRoundStatus를 spyOn으로 모킹
vi.mock('@/lib/rounds/fsm', async (importOriginal) => {
  const original = await importOriginal<typeof fsmModule>();
  return {
    ...original,
    transitionRoundStatus: vi.fn(),
  };
});

describe('RoundService', () => {
  describe('createNextScheduledRound', () => {
    const type: RoundType = '6HOUR';

    const mockRepository = {
      findLastRound: vi.fn(),
      findByStartTime: vi.fn(),
      insert: vi.fn(),
    };
    const roundService = new RoundService(mockRepository as unknown as RoundRepository);

    beforeEach(() => {
      vi.useFakeTimers();
      // 이러면 다음 슬롯은 14:00KST
      vi.setSystemTime(new Date('2025-11-24T00:00:00Z'));
      mockRepository.findLastRound.mockReset();
      mockRepository.findByStartTime.mockReset();
      mockRepository.insert.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('마지막 라운드가 없으면 시간대에 맞춰 첫 라운드를 생성한다', async () => {
      mockRepository.findLastRound.mockResolvedValue(undefined);
      mockRepository.findByStartTime.mockResolvedValue(undefined);
      mockRepository.insert.mockImplementation(
        async (roundData: RoundInsert) => roundData as unknown as Round,
      );

      const round = await roundService.createNextScheduledRound();

      expect(mockRepository.findLastRound).toHaveBeenCalledWith(type);
      expect(round.startTime % (6 * 60 * 60 * 1000)).toBe(5 * 60 * 60 * 1000); // 05:00 UTC 그리드
      expect(round.roundNumber).toBe(1);
      expect(round.createdAt).toBeDefined();
    });

    it('마지막 라운드가 있으면 +6h, roundNumber +1 증가한 라운드를 생성한다', async () => {
      const last = {
        startTime: 1700000000,
        roundNumber: 10,
      };
      mockRepository.findLastRound.mockResolvedValue(last);
      mockRepository.findByStartTime.mockResolvedValue(undefined);
      mockRepository.insert.mockImplementation(
        async (roundData: RoundInsert) => roundData as unknown as Round,
      );

      const round = await roundService.createNextScheduledRound();

      expect(round.roundNumber).toBe(11);
      expect(round.startTime).toBe(last.startTime + 6 * 60 * 60 * 1000);
    });

    it('같은 startTime 라운드가 이미 있으면 기존 라운드를 반환한다', async () => {
      const existing = { id: 'existing-id', startTime: 1, roundNumber: 7 } as Round;
      mockRepository.findLastRound.mockResolvedValue(undefined);
      mockRepository.findByStartTime.mockResolvedValue(existing);

      const round = await roundService.createNextScheduledRound();

      expect(round).toBe(existing);
      expect(mockRepository.insert).not.toHaveBeenCalled();
    });

    it('insert 에러가 발생하면 에러를 전파한다', async () => {
      mockRepository.findLastRound.mockResolvedValue(undefined);
      mockRepository.findByStartTime.mockResolvedValue(undefined);
      mockRepository.insert.mockRejectedValue(new Error('DB fail'));

      await expect(roundService.createNextScheduledRound()).rejects.toThrow('DB fail');
    });
  });

  describe('openRound', () => {
    const mockTransition = fsmModule.transitionRoundStatus as Mock;

    // 테스트용 기준 시각: 2025-01-15 09:00:00 UTC
    const NOW = new Date('2025-01-15T09:00:00Z').getTime();

    const createMockRound = (overrides: Partial<Round> = {}): Round => ({
      id: '550e8400-e29b-41d4-a716-446655440000',
      roundNumber: 1,
      type: '6HOUR',
      status: 'SCHEDULED',
      startTime: NOW - 60_000, // 1분 전 시작
      endTime: NOW + 6 * 60 * 60 * 1000, // 6시간 후 종료
      lockTime: NOW + 60_000, // 1분 후 락
      totalPool: 0,
      totalGoldBets: 0,
      totalBtcBets: 0,
      totalBetsCount: 0,
      goldStartPrice: null,
      btcStartPrice: null,
      goldEndPrice: null,
      btcEndPrice: null,
      goldChangePercent: null,
      btcChangePercent: null,
      winner: null,
      priceSnapshotStartAt: null,
      priceSnapshotEndAt: null,
      startPriceSource: null,
      endPriceSource: null,
      startPriceIsFallback: false,
      endPriceIsFallback: false,
      startPriceFallbackReason: null,
      endPriceFallbackReason: null,
      suiPoolAddress: null,
      suiSettlementObjectId: null,
      platformFeeRate: '0.05',
      platformFeeCollected: 0,
      bettingOpenedAt: null,
      bettingLockedAt: null,
      roundEndedAt: null,
      settlementCompletedAt: null,
      createdAt: NOW - 3600_000,
      updatedAt: NOW - 3600_000,
      ...overrides,
    });

    const mockPrices: PriceData = {
      gold: 2650.5,
      btc: 98234.0,
      timestamp: NOW,
      source: 'kitco',
    };

    let mockRepository: {
      findLatestByStatus: Mock;
    };
    let roundService: RoundService;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(NOW));

      mockRepository = {
        findLatestByStatus: vi.fn(),
      };
      roundService = new RoundService(mockRepository as unknown as RoundRepository);

      mockTransition.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('SCHEDULED 라운드가 없으면 no_round를 반환한다', async () => {
      mockRepository.findLatestByStatus.mockResolvedValue(null);

      const result = await roundService.openRound(mockPrices);

      expect(result.status).toBe('no_round');
      expect(result.message).toBe('No scheduled round found');
      expect(result.round).toBeUndefined();
      expect(mockTransition).not.toHaveBeenCalled();
    });

    it('startTime이 아직 안 됐으면 not_ready를 반환한다', async () => {
      const futureRound = createMockRound({
        startTime: NOW + 60_000, // 1분 후 시작
        lockTime: NOW + 120_000,
      });
      mockRepository.findLatestByStatus.mockResolvedValue(futureRound);

      const result = await roundService.openRound(mockPrices);

      expect(result.status).toBe('not_ready');
      expect(result.round).toEqual(futureRound);
      expect(result.message).toContain('not ready');
      expect(mockTransition).not.toHaveBeenCalled();
    });

    it('lockTime이 이미 지났으면 라운드를 취소하고 cancelled를 반환한다', async () => {
      const expiredRound = createMockRound({
        startTime: NOW - 120_000, // 2분 전 시작
        lockTime: NOW - 60_000, // 1분 전 락 (이미 지남)
      });
      mockRepository.findLatestByStatus.mockResolvedValue(expiredRound);

      const cancelledRound = { ...expiredRound, status: 'CANCELLED' as const };
      mockTransition.mockResolvedValue(cancelledRound);

      const result = await roundService.openRound(mockPrices);

      expect(result.status).toBe('cancelled');
      expect(result.round?.status).toBe('CANCELLED');
      expect(result.message).toContain('missed open window');
      expect(mockTransition).toHaveBeenCalledWith(
        expiredRound.id,
        'CANCELLED',
        expect.objectContaining({
          cancellationReason: 'MISSED_OPEN_WINDOW',
          cancelledBy: 'SYSTEM',
        }),
      );
    });

    it('정상 케이스: SCHEDULED → BETTING_OPEN 전이를 수행하고 opened를 반환한다', async () => {
      const scheduledRound = createMockRound();
      mockRepository.findLatestByStatus.mockResolvedValue(scheduledRound);

      const openedRound = { ...scheduledRound, status: 'BETTING_OPEN' as const };
      mockTransition.mockResolvedValue(openedRound);

      const result = await roundService.openRound(mockPrices);

      expect(result.status).toBe('opened');
      expect(result.round?.status).toBe('BETTING_OPEN');
      expect(mockTransition).toHaveBeenCalledWith(
        scheduledRound.id,
        'BETTING_OPEN',
        expect.objectContaining({
          goldStartPrice: '2650.5',
          btcStartPrice: '98234',
          priceSnapshotStartAt: mockPrices.timestamp,
          startPriceSource: 'kitco',
        }),
      );
    });

    it('transitionRoundStatus에 올바른 metadata를 전달한다', async () => {
      const scheduledRound = createMockRound();
      mockRepository.findLatestByStatus.mockResolvedValue(scheduledRound);
      mockTransition.mockResolvedValue({ ...scheduledRound, status: 'BETTING_OPEN' });

      await roundService.openRound(mockPrices);

      const callArgs = mockTransition.mock.calls[0];
      expect(callArgs[0]).toBe(scheduledRound.id);
      expect(callArgs[1]).toBe('BETTING_OPEN');

      const metadata = callArgs[2];
      expect(metadata.goldStartPrice).toBe('2650.5');
      expect(metadata.btcStartPrice).toBe('98234');
      expect(metadata.priceSnapshotStartAt).toBe(mockPrices.timestamp);
      expect(metadata.startPriceSource).toBe('kitco');
      expect(metadata.bettingOpenedAt).toBeTypeOf('number');
    });

    it('시작 시각과 락 시각 경계에서 정확하게 동작한다 (startTime == now)', async () => {
      // startTime이 정확히 now인 경우 → 오픈 가능
      const edgeRound = createMockRound({
        startTime: NOW,
        lockTime: NOW + 60_000,
      });
      mockRepository.findLatestByStatus.mockResolvedValue(edgeRound);
      mockTransition.mockResolvedValue({ ...edgeRound, status: 'BETTING_OPEN' });

      const result = await roundService.openRound(mockPrices);

      expect(result.status).toBe('opened');
    });

    it('락 시각 경계에서 정확하게 동작한다 (lockTime == now)', async () => {
      // lockTime이 정확히 now인 경우 → 취소됨
      const edgeRound = createMockRound({
        startTime: NOW - 60_000,
        lockTime: NOW, // 정확히 now
      });
      mockRepository.findLatestByStatus.mockResolvedValue(edgeRound);
      mockTransition.mockResolvedValue({ ...edgeRound, status: 'CANCELLED' });

      const result = await roundService.openRound(mockPrices);

      expect(result.status).toBe('cancelled');
    });
  });

  describe('lockRound', () => {
    const mockTransition = fsmModule.transitionRoundStatus as Mock;

    const NOW = new Date('2025-01-15T09:00:00Z').getTime();

    const createMockRound = (overrides: Partial<Round> = {}): Round => ({
      id: '550e8400-e29b-41d4-a716-446655440001',
      roundNumber: 1,
      type: '6HOUR',
      status: 'BETTING_OPEN',
      startTime: NOW - 60_000,
      endTime: NOW + 6 * 60 * 60 * 1000,
      lockTime: NOW - 1000, // 1초 전 락 (이미 지남)
      totalPool: 1000,
      totalGoldBets: 600,
      totalBtcBets: 400,
      totalBetsCount: 10,
      goldStartPrice: '2650.50',
      btcStartPrice: '98234.00',
      goldEndPrice: null,
      btcEndPrice: null,
      goldChangePercent: null,
      btcChangePercent: null,
      winner: null,
      priceSnapshotStartAt: NOW - 60_000,
      priceSnapshotEndAt: null,
      startPriceSource: 'kitco',
      endPriceSource: null,
      startPriceIsFallback: false,
      endPriceIsFallback: false,
      startPriceFallbackReason: null,
      endPriceFallbackReason: null,
      suiPoolAddress: null,
      suiSettlementObjectId: null,
      platformFeeRate: '0.05',
      platformFeeCollected: 0,
      bettingOpenedAt: NOW - 60_000,
      bettingLockedAt: null,
      roundEndedAt: null,
      settlementCompletedAt: null,
      createdAt: NOW - 3600_000,
      updatedAt: NOW - 60_000,
      ...overrides,
    });

    let mockRepository: {
      findLatestByStatus: Mock;
    };
    let roundService: RoundService;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(NOW));

      mockRepository = {
        findLatestByStatus: vi.fn(),
      };
      roundService = new RoundService(mockRepository as unknown as RoundRepository);

      mockTransition.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('BETTING_OPEN 라운드가 없으면 no_round를 반환한다', async () => {
      mockRepository.findLatestByStatus.mockResolvedValue(null);

      const result = await roundService.lockRound();

      expect(result.status).toBe('no_round');
      expect(result.message).toBe('No open round found');
      expect(result.round).toBeUndefined();
      expect(mockTransition).not.toHaveBeenCalled();
    });

    it('lockTime이 아직 안 됐으면 not_ready를 반환한다', async () => {
      const earlyRound = createMockRound({
        lockTime: NOW + 60_000, // 1분 후 락
      });
      mockRepository.findLatestByStatus.mockResolvedValue(earlyRound);

      const result = await roundService.lockRound();

      expect(result.status).toBe('not_ready');
      expect(result.round).toEqual(earlyRound);
      expect(result.message).toContain('not ready');
      expect(mockTransition).not.toHaveBeenCalled();
    });

    it('정상 케이스: BETTING_OPEN → BETTING_LOCKED 전이를 수행하고 locked를 반환한다', async () => {
      const openRound = createMockRound();
      mockRepository.findLatestByStatus.mockResolvedValue(openRound);

      const lockedRound = { ...openRound, status: 'BETTING_LOCKED' as const };
      mockTransition.mockResolvedValue(lockedRound);

      const result = await roundService.lockRound();

      expect(result.status).toBe('locked');
      expect(result.round?.status).toBe('BETTING_LOCKED');
      expect(mockTransition).toHaveBeenCalledWith(
        openRound.id,
        'BETTING_LOCKED',
        expect.objectContaining({
          bettingLockedAt: expect.any(Number),
        }),
      );
    });

    it('transitionRoundStatus에 올바른 metadata를 전달한다', async () => {
      const openRound = createMockRound();
      mockRepository.findLatestByStatus.mockResolvedValue(openRound);
      mockTransition.mockResolvedValue({ ...openRound, status: 'BETTING_LOCKED' });

      await roundService.lockRound();

      const callArgs = mockTransition.mock.calls[0];
      expect(callArgs[0]).toBe(openRound.id);
      expect(callArgs[1]).toBe('BETTING_LOCKED');

      const metadata = callArgs[2];
      expect(metadata.bettingLockedAt).toBeTypeOf('number');
      expect(metadata.bettingLockedAt).toBe(NOW);
    });

    it('락 시각 경계에서 정확하게 동작한다 (lockTime == now)', async () => {
      // lockTime이 정확히 now인 경우 → 아직 락 안됨 (lockTime > now 조건)
      const edgeRound = createMockRound({
        lockTime: NOW,
      });
      mockRepository.findLatestByStatus.mockResolvedValue(edgeRound);
      mockTransition.mockResolvedValue({ ...edgeRound, status: 'BETTING_LOCKED' });

      const result = await roundService.lockRound();

      // lockTime > now 조건이므로 lockTime == now면 락 가능
      expect(result.status).toBe('locked');
    });

    it('락 시각 경계에서 정확하게 동작한다 (lockTime > now by 1ms)', async () => {
      const edgeRound = createMockRound({
        lockTime: NOW + 1, // 1ms 후
      });
      mockRepository.findLatestByStatus.mockResolvedValue(edgeRound);

      const result = await roundService.lockRound();

      expect(result.status).toBe('not_ready');
    });
  });
});
