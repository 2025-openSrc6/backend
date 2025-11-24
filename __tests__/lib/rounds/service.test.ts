import { RoundService } from '@/lib/rounds/service';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RoundType } from '@/lib/rounds/types';
import { RoundRepository } from '@/lib/rounds/repository';
import type { RoundInsert } from '@/lib/rounds/types';
import type { Round } from '@/lib/rounds/types';

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
});
