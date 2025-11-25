import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { canTransition, ALLOWED_TRANSITIONS, transitionRoundStatus } from '@/lib/rounds/fsm';
import type { RoundStatus, Round } from '@/lib/rounds/types';
import { registry } from '@/lib/registry';
import { ValidationError, BusinessRuleError, NotFoundError } from '@/lib/shared/errors';

describe('FSM Unit Tests', () => {
  describe('canTransition', () => {
    describe('허용된 정방향 전이', () => {
      it('SCHEDULED → BETTING_OPEN을 허용한다', () => {
        expect(canTransition('SCHEDULED', 'BETTING_OPEN')).toBe(true);
      });

      it('BETTING_OPEN → BETTING_LOCKED를 허용한다', () => {
        expect(canTransition('BETTING_OPEN', 'BETTING_LOCKED')).toBe(true);
      });

      it('BETTING_LOCKED → CALCULATING을 허용한다', () => {
        expect(canTransition('BETTING_LOCKED', 'CALCULATING')).toBe(true);
      });

      it('CALCULATING → SETTLED를 허용한다', () => {
        expect(canTransition('CALCULATING', 'SETTLED')).toBe(true);
      });

      it('CALCULATING → VOIDED를 허용한다', () => {
        expect(canTransition('CALCULATING', 'VOIDED')).toBe(true);
      });
    });

    describe('CANCELLED 전이', () => {
      it('SCHEDULED → CANCELLED를 허용한다', () => {
        expect(canTransition('SCHEDULED', 'CANCELLED')).toBe(true);
      });

      it('BETTING_OPEN → CANCELLED를 허용한다', () => {
        expect(canTransition('BETTING_OPEN', 'CANCELLED')).toBe(true);
      });

      it('BETTING_LOCKED → CANCELLED를 허용한다', () => {
        expect(canTransition('BETTING_LOCKED', 'CANCELLED')).toBe(true);
      });

      it('CALCULATING → CANCELLED를 허용한다', () => {
        expect(canTransition('CALCULATING', 'CANCELLED')).toBe(true);
      });
    });

    describe('거부된 역방향 전이', () => {
      it('BETTING_OPEN → SCHEDULED를 거부한다', () => {
        expect(canTransition('BETTING_OPEN', 'SCHEDULED')).toBe(false);
      });

      it('BETTING_LOCKED → BETTING_OPEN을 거부한다', () => {
        expect(canTransition('BETTING_LOCKED', 'BETTING_OPEN')).toBe(false);
      });

      it('CALCULATING → BETTING_LOCKED을 거부한다', () => {
        expect(canTransition('CALCULATING', 'BETTING_LOCKED')).toBe(false);
      });

      it('SETTLED → CALCULATING을 거부한다', () => {
        expect(canTransition('SETTLED', 'CALCULATING')).toBe(false);
      });
    });

    describe('거부된 단계 건너뛰기', () => {
      it('SCHEDULED → BETTING_LOCKED를 거부한다', () => {
        expect(canTransition('SCHEDULED', 'BETTING_LOCKED')).toBe(false);
      });

      it('SCHEDULED → CALCULATING을 거부한다', () => {
        expect(canTransition('SCHEDULED', 'CALCULATING')).toBe(false);
      });

      it('BETTING_OPEN → SETTLED를 거부한다', () => {
        expect(canTransition('BETTING_OPEN', 'SETTLED')).toBe(false);
      });
    });

    describe('종료 상태에서의 전이 거부', () => {
      it('SETTLED 상태에서는 어떤 전이도 허용하지 않는다', () => {
        const terminatedStates: RoundStatus[] = [
          'SCHEDULED',
          'BETTING_OPEN',
          'BETTING_LOCKED',
          'CALCULATING',
          'SETTLED',
          'CANCELLED',
          'VOIDED',
        ];

        terminatedStates.forEach((targetStatus) => {
          expect(canTransition('SETTLED', targetStatus)).toBe(false);
        });
      });

      it('CANCELLED 상태에서는 어떤 전이도 허용하지 않는다', () => {
        const terminatedStates: RoundStatus[] = [
          'SCHEDULED',
          'BETTING_OPEN',
          'BETTING_LOCKED',
          'CALCULATING',
          'SETTLED',
          'CANCELLED',
          'VOIDED',
        ];

        terminatedStates.forEach((targetStatus) => {
          expect(canTransition('CANCELLED', targetStatus)).toBe(false);
        });
      });

      it('VOIDED 상태에서는 어떤 전이도 허용하지 않는다', () => {
        const terminatedStates: RoundStatus[] = [
          'SCHEDULED',
          'BETTING_OPEN',
          'BETTING_LOCKED',
          'CALCULATING',
          'SETTLED',
          'CANCELLED',
          'VOIDED',
        ];

        terminatedStates.forEach((targetStatus) => {
          expect(canTransition('VOIDED', targetStatus)).toBe(false);
        });
      });
    });

    describe('ALLOWED_TRANSITIONS 상수 검증', () => {
      it('모든 상태가 ALLOWED_TRANSITIONS에 정의되어 있다', () => {
        const allStatuses: RoundStatus[] = [
          'SCHEDULED',
          'BETTING_OPEN',
          'BETTING_LOCKED',
          'CALCULATING',
          'SETTLED',
          'CANCELLED',
          'VOIDED',
        ];

        allStatuses.forEach((status) => {
          expect(ALLOWED_TRANSITIONS).toHaveProperty(status);
          expect(Array.isArray(ALLOWED_TRANSITIONS[status])).toBe(true);
        });
      });

      it('종료 상태는 빈 배열을 가진다', () => {
        expect(ALLOWED_TRANSITIONS.SETTLED).toEqual([]);
        expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
        expect(ALLOWED_TRANSITIONS.VOIDED).toEqual([]);
      });
    });
  });

  describe('transitionRoundStatus', () => {
    const now = Date.now();
    const mockRound: Round = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      roundNumber: 1,
      type: '6HOUR',
      status: 'SCHEDULED',
      startTime: now + 60000,
      endTime: now + 21660000,
      lockTime: now + 21600000,
      totalPool: 0,
      totalGoldBets: 0,
      totalBtcBets: 0,
      totalBetsCount: 0,
      goldStartPrice: null,
      btcStartPrice: null,
      goldEndPrice: null,
      btcEndPrice: null,
      priceSnapshotStartAt: null,
      priceSnapshotEndAt: null,
      startPriceSource: null,
      endPriceSource: null,
      startPriceIsFallback: false,
      endPriceIsFallback: false,
      startPriceFallbackReason: null,
      endPriceFallbackReason: null,
      goldChangePercent: null,
      btcChangePercent: null,
      winner: null,
      platformFeeRate: '0.05',
      platformFeeCollected: 0,
      suiPoolAddress: null,
      suiSettlementObjectId: null,
      bettingOpenedAt: null,
      bettingLockedAt: null,
      roundEndedAt: null,
      settlementCompletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    beforeEach(() => {
      // 각 테스트 전에 registry 초기화
      vi.clearAllMocks();
    });

    afterEach(() => {
      // 테스트 후 정리
      vi.restoreAllMocks();
    });

    describe('입력 검증', () => {
      it('유효하지 않은 UUID 형식이면 ValidationError를 던진다', async () => {
        await expect(transitionRoundStatus('invalid-uuid', 'BETTING_OPEN')).rejects.toThrow(
          ValidationError,
        );
      });

      it('UUID 형식이지만 라운드가 존재하지 않으면 NotFoundError를 던진다', async () => {
        const mockService = {
          getRoundById: vi.fn().mockRejectedValue(new NotFoundError('Round', mockRound.id)),
          updateRoundById: vi.fn(),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        await expect(transitionRoundStatus(mockRound.id, 'BETTING_OPEN')).rejects.toThrow(
          NotFoundError,
        );

        expect(mockService.getRoundById).toHaveBeenCalledWith(mockRound.id);
      });
    });

    describe('전이 규칙 검증', () => {
      it('허용되지 않은 전이면 BusinessRuleError를 던진다', async () => {
        const settledRound = { ...mockRound, status: 'SETTLED' };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(settledRound),
          updateRoundById: vi.fn(),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        await expect(transitionRoundStatus(mockRound.id, 'BETTING_OPEN')).rejects.toThrow(
          BusinessRuleError,
        );

        expect(mockService.updateRoundById).not.toHaveBeenCalled();
      });

      it('역방향 전이를 시도하면 BusinessRuleError를 던진다', async () => {
        const openRound = { ...mockRound, status: 'BETTING_OPEN' };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(openRound),
          updateRoundById: vi.fn(),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        await expect(transitionRoundStatus(mockRound.id, 'SCHEDULED')).rejects.toThrow(
          BusinessRuleError,
        );
      });
    });

    describe('멱등성 보장', () => {
      it('이미 목표 상태면 업데이트 없이 현재 라운드를 반환한다', async () => {
        const openRound = { ...mockRound, status: 'BETTING_OPEN' };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(openRound),
          updateRoundById: vi.fn(),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        const result = await transitionRoundStatus(mockRound.id, 'BETTING_OPEN');

        expect(result).toEqual(openRound);
        expect(mockService.updateRoundById).not.toHaveBeenCalled();
      });
    });

    describe('필수 필드 검증', () => {
      it('SCHEDULED → BETTING_OPEN 전이 시 필수 필드가 없으면 ValidationError를 던진다', async () => {
        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(mockRound),
          updateRoundById: vi.fn(),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        await expect(
          transitionRoundStatus(mockRound.id, 'BETTING_OPEN', {
            goldStartPrice: '2650.50',
            // btcStartPrice 누락
          }),
        ).rejects.toThrow(ValidationError);
      });

      it('BETTING_OPEN → BETTING_LOCKED 전이 시 필수 필드가 없으면 ValidationError를 던진다', async () => {
        const openRound = { ...mockRound, status: 'BETTING_OPEN' };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(openRound),
          updateRoundById: vi.fn(),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        await expect(transitionRoundStatus(mockRound.id, 'BETTING_LOCKED', {})).rejects.toThrow(
          ValidationError,
        );
      });

      it('BETTING_LOCKED → CALCULATING 전이 시 필수 필드가 없으면 ValidationError를 던진다', async () => {
        const lockedRound = { ...mockRound, status: 'BETTING_LOCKED' };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(lockedRound),
          updateRoundById: vi.fn(),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        await expect(
          transitionRoundStatus(mockRound.id, 'CALCULATING', {
            goldEndPrice: '10',
            // roundEndedAt, btcEndPrice 등 누락
          }),
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('성공적인 전이', () => {
      it('SCHEDULED → BETTING_OPEN 전이가 성공한다', async () => {
        const metadata = {
          goldStartPrice: '2650.50',
          btcStartPrice: '98234.00',
          priceSnapshotStartAt: Date.now(),
          startPriceSource: 'kitco',
          suiPoolAddress: '0x123',
          bettingOpenedAt: Date.now(),
        };

        const updatedRound = {
          ...mockRound,
          status: 'BETTING_OPEN',
          ...metadata,
        };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(mockRound),
          updateRoundById: vi.fn().mockResolvedValue(updatedRound),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        const result = await transitionRoundStatus(mockRound.id, 'BETTING_OPEN', metadata);

        expect(result.status).toBe('BETTING_OPEN');
        expect(mockService.updateRoundById).toHaveBeenCalledWith(
          mockRound.id,
          expect.objectContaining({
            status: 'BETTING_OPEN',
            ...metadata,
          }),
        );
      });

      it('BETTING_OPEN → BETTING_LOCKED 전이가 성공한다', async () => {
        const openRound = { ...mockRound, status: 'BETTING_OPEN' };
        const metadata = {
          bettingLockedAt: Date.now(),
        };

        const updatedRound = {
          ...openRound,
          status: 'BETTING_LOCKED',
          ...metadata,
        };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(openRound),
          updateRoundById: vi.fn().mockResolvedValue(updatedRound),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        const result = await transitionRoundStatus(mockRound.id, 'BETTING_LOCKED', metadata);

        expect(result.status).toBe('BETTING_LOCKED');
        expect(mockService.updateRoundById).toHaveBeenCalledTimes(1);
      });

      it('BETTING_LOCKED → CALCULATING 전이가 성공한다', async () => {
        const lockedRound = { ...mockRound, status: 'BETTING_LOCKED' };

        const metadata = {
          roundEndedAt: Date.now(),
          goldEndPrice: '10',
          btcEndPrice: '1',
          priceSnapshotEndAt: Date.now(),
          endPriceSource: 'mock',
          goldChangePercent: '1.1',
          btcChangePercent: '0.9',
          winner: 'GOLD',
        };

        const updatedRound = {
          ...lockedRound,
          status: 'CALCULATING',
          ...metadata,
        };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(lockedRound),
          updateRoundById: vi.fn().mockResolvedValue(updatedRound),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        const result = await transitionRoundStatus(mockRound.id, 'CALCULATING', metadata);

        expect(mockService.getRoundById).toHaveBeenCalledWith(mockRound.id);
        expect(mockService.updateRoundById).toHaveBeenCalledWith(mockRound.id, {
          status: 'CALCULATING',
          ...metadata,
          updatedAt: expect.any(Number),
        });
        expect(result).toEqual(updatedRound);
      });

      it('ANY → CANCELLED 전이가 성공한다 (필수 필드 없음)', async () => {
        const updatedRound = {
          ...mockRound,
          status: 'CANCELLED',
        };

        const mockService = {
          getRoundById: vi.fn().mockResolvedValue(mockRound),
          updateRoundById: vi.fn().mockResolvedValue(updatedRound),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        const result = await transitionRoundStatus(mockRound.id, 'CANCELLED');

        expect(result.status).toBe('CANCELLED');
      });
    });

    describe('전체 라이프사이클 테스트', () => {
      it('SCHEDULED → BETTING_OPEN → BETTING_LOCKED → CALCULATING → SETTLED 전체 플로우를 완료한다', async () => {
        let currentRound = { ...mockRound };

        const mockService = {
          getRoundById: vi.fn().mockImplementation(() => Promise.resolve(currentRound)),
          updateRoundById: vi.fn().mockImplementation((_id: string, data: Partial<Round>) => {
            currentRound = { ...currentRound, ...data };
            return Promise.resolve(currentRound);
          }),
        };

        registry.setRoundService(mockService as unknown as typeof registry.roundService);

        // 1. SCHEDULED → BETTING_OPEN
        await transitionRoundStatus(mockRound.id, 'BETTING_OPEN', {
          goldStartPrice: '2650.50',
          btcStartPrice: '98234.00',
          priceSnapshotStartAt: Date.now(),
          startPriceSource: 'kitco',
          suiPoolAddress: '0x123',
          bettingOpenedAt: Date.now(),
        });
        expect(currentRound.status).toBe('BETTING_OPEN');

        // 2. BETTING_OPEN → BETTING_LOCKED
        await transitionRoundStatus(mockRound.id, 'BETTING_LOCKED', {
          bettingLockedAt: Date.now(),
        });
        expect(currentRound.status).toBe('BETTING_LOCKED');

        // 3. BETTING_LOCKED → CALCULATING
        await transitionRoundStatus(mockRound.id, 'CALCULATING', {
          roundEndedAt: Date.now(),
          goldEndPrice: '2655.00',
          btcEndPrice: '98500.00',
          priceSnapshotEndAt: Date.now(),
          endPriceSource: 'kitco',
          goldChangePercent: '0.17',
          btcChangePercent: '0.27',
          winner: 'BTC',
        });
        expect(currentRound.status).toBe('CALCULATING');

        // 5. CALCULATING → SETTLED
        await transitionRoundStatus(mockRound.id, 'SETTLED', {
          platformFeeCollected: 100,
          suiSettlementObjectId: '0x456',
          settlementCompletedAt: Date.now(),
        });
        expect(currentRound.status).toBe('SETTLED');
      });
    });
  });
});
