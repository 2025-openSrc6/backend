import { describe, it, expect } from 'vitest';
import {
  determineWinner,
  calculatePayout,
  calculateIndividualPayout,
} from '@/lib/rounds/calculator';

describe('Calculator Unit Tests', () => {
  describe('determineWinner', () => {
    describe('금 승리 케이스', () => {
      it('금 변동률이 더 높으면 GOLD를 반환한다', () => {
        const result = determineWinner({
          goldStart: 2650,
          goldEnd: 2680, // +1.13%
          btcStart: 98000,
          btcEnd: 99000, // +1.02%
        });

        expect(result.winner).toBe('GOLD');
        expect(result.goldChangePercent).toBeCloseTo(1.13, 1);
        expect(result.btcChangePercent).toBeCloseTo(1.02, 1);
      });

      it('금 가격이 크게 상승하면 GOLD를 반환한다', () => {
        const result = determineWinner({
          goldStart: 2000,
          goldEnd: 2200, // +10%
          btcStart: 100000,
          btcEnd: 105000, // +5%
        });

        expect(result.winner).toBe('GOLD');
        expect(result.goldChangePercent).toBeCloseTo(10, 0);
        expect(result.btcChangePercent).toBeCloseTo(5, 0);
      });

      it('비트가 하락하고 금이 상승하면 GOLD를 반환한다', () => {
        const result = determineWinner({
          goldStart: 2650,
          goldEnd: 2700, // +1.89%
          btcStart: 98000,
          btcEnd: 97000, // -1.02%
        });

        expect(result.winner).toBe('GOLD');
        expect(result.goldChangePercent).toBeGreaterThan(0);
        expect(result.btcChangePercent).toBeLessThan(0);
      });
    });

    describe('비트코인 승리 케이스', () => {
      it('비트 변동률이 더 높으면 BTC를 반환한다', () => {
        const result = determineWinner({
          goldStart: 2650,
          goldEnd: 2660, // +0.38%
          btcStart: 98000,
          btcEnd: 99000, // +1.02%
        });

        expect(result.winner).toBe('BTC');
        expect(result.btcChangePercent).toBeGreaterThan(result.goldChangePercent);
      });

      it('비트가 크게 상승하면 BTC를 반환한다', () => {
        const result = determineWinner({
          goldStart: 2000,
          goldEnd: 2050, // +2.5%
          btcStart: 100000,
          btcEnd: 115000, // +15%
        });

        expect(result.winner).toBe('BTC');
        expect(result.btcChangePercent).toBeCloseTo(15, 0);
      });

      it('둘 다 하락하지만 금이 더 많이 하락하면 BTC를 반환한다', () => {
        const result = determineWinner({
          goldStart: 2650,
          goldEnd: 2500, // -5.66%
          btcStart: 98000,
          btcEnd: 95000, // -3.06%
        });

        expect(result.winner).toBe('BTC');
        expect(result.goldChangePercent).toBeLessThan(result.btcChangePercent);
      });
    });

    describe('동률 시 금 승리 케이스', () => {
      it('변동률이 완전히 같으면 GOLD를 반환한다 (동률 시 금 승리)', () => {
        const result = determineWinner({
          goldStart: 2650,
          goldEnd: 2652.65, // +0.10%
          btcStart: 98000,
          btcEnd: 98098, // +0.10%
        });

        expect(result.winner).toBe('GOLD');
      });

      it('둘 다 변동 없으면 GOLD를 반환한다 (동률 시 금 승리)', () => {
        const result = determineWinner({
          goldStart: 2650,
          goldEnd: 2650, // 0%
          btcStart: 98000,
          btcEnd: 98000, // 0%
        });

        expect(result.winner).toBe('GOLD');
        expect(result.goldChangePercent).toBe(0);
        expect(result.btcChangePercent).toBe(0);
      });
    });

    describe('변동률 계산 정확성', () => {
      it('양수 변동률을 정확하게 계산한다', () => {
        const result = determineWinner({
          goldStart: 100,
          goldEnd: 110, // +10%
          btcStart: 1000,
          btcEnd: 1050, // +5%
        });

        expect(result.goldChangePercent).toBe(10);
        expect(result.btcChangePercent).toBe(5);
      });

      it('음수 변동률을 정확하게 계산한다', () => {
        const result = determineWinner({
          goldStart: 100,
          goldEnd: 90, // -10%
          btcStart: 1000,
          btcEnd: 900, // -10%
        });

        expect(result.goldChangePercent).toBe(-10);
        expect(result.btcChangePercent).toBe(-10);
      });

      it('소수점 변동률을 정확하게 계산한다', () => {
        const result = determineWinner({
          goldStart: 2650.5,
          goldEnd: 2653.155, // +0.1%
          btcStart: 98234,
          btcEnd: 98332.234, // +0.1%
        });

        expect(result.goldChangePercent).toBeCloseTo(0.1, 1);
        expect(result.btcChangePercent).toBeCloseTo(0.1, 1);
      });
    });

    describe('엣지 케이스', () => {
      it('매우 작은 변동률 차이에서도 정확히 판정한다', () => {
        const result = determineWinner({
          goldStart: 2650,
          goldEnd: 2650.001, // +0.0000377%
          btcStart: 98000,
          btcEnd: 98000.001, // +0.0000010%
        });

        expect(result.winner).toBe('GOLD');
      });

      it('큰 가격 변동에서도 정확히 계산한다', () => {
        const result = determineWinner({
          goldStart: 1000,
          goldEnd: 2000, // +100%
          btcStart: 50000,
          btcEnd: 150000, // +200%
        });

        expect(result.winner).toBe('BTC');
        expect(result.goldChangePercent).toBe(100);
        expect(result.btcChangePercent).toBe(200);
      });
    });
  });

  describe('calculatePayout', () => {
    describe('기본 배당 계산', () => {
      it('GOLD 승리 시 올바른 배당을 계산한다', () => {
        const result = calculatePayout({
          winner: 'GOLD',
          totalPool: 1000000,
          totalGoldBets: 600000,
          totalBtcBets: 400000,
          platformFeeRate: 0.05,
        });

        expect(result.platformFee).toBe(50000); // 5%
        expect(result.payoutPool).toBe(950000);
        expect(result.winningPool).toBe(600000);
        expect(result.losingPool).toBe(400000);
        expect(result.payoutRatio).toBeCloseTo(1.583, 2); // 950000 / 600000
      });

      it('BTC 승리 시 올바른 배당을 계산한다', () => {
        const result = calculatePayout({
          winner: 'BTC',
          totalPool: 1000000,
          totalGoldBets: 600000,
          totalBtcBets: 400000,
          platformFeeRate: 0.05,
        });

        expect(result.platformFee).toBe(50000);
        expect(result.payoutPool).toBe(950000);
        expect(result.winningPool).toBe(400000);
        expect(result.losingPool).toBe(600000);
        expect(result.payoutRatio).toBeCloseTo(2.375, 2); // 950000 / 400000
      });
    });

    describe('플랫폼 수수료 계산', () => {
      it('0% 수수료를 올바르게 계산한다', () => {
        const result = calculatePayout({
          winner: 'GOLD',
          totalPool: 1000000,
          totalGoldBets: 500000,
          totalBtcBets: 500000,
          platformFeeRate: 0,
        });

        expect(result.platformFee).toBe(0);
        expect(result.payoutPool).toBe(1000000);
        expect(result.payoutRatio).toBe(2); // 1000000 / 500000
      });

      it('10% 수수료를 올바르게 계산한다', () => {
        const result = calculatePayout({
          winner: 'GOLD',
          totalPool: 1000000,
          totalGoldBets: 500000,
          totalBtcBets: 500000,
          platformFeeRate: 0.1,
        });

        expect(result.platformFee).toBe(100000);
        expect(result.payoutPool).toBe(900000);
      });

      it('수수료 계산 시 내림 처리한다', () => {
        const result = calculatePayout({
          winner: 'GOLD',
          totalPool: 1000001, // 50000.05 → 50000
          totalGoldBets: 500000,
          totalBtcBets: 500001,
          platformFeeRate: 0.05,
        });

        expect(result.platformFee).toBe(50000); // Math.floor
      });
    });

    describe('승자 풀이 0인 경우', () => {
      it('승자 풀이 0이면 payoutRatio가 0이다', () => {
        const result = calculatePayout({
          winner: 'GOLD',
          totalPool: 1000000,
          totalGoldBets: 0, // 승자 풀이 0
          totalBtcBets: 1000000,
          platformFeeRate: 0.05,
        });

        expect(result.payoutRatio).toBe(0);
        expect(result.winningPool).toBe(0);
      });
    });

    describe('균등 배분 케이스', () => {
      it('50:50 베팅 시 배당비율이 약 2배이다 (수수료 제외 후)', () => {
        const result = calculatePayout({
          winner: 'GOLD',
          totalPool: 1000000,
          totalGoldBets: 500000,
          totalBtcBets: 500000,
          platformFeeRate: 0.05,
        });

        // 950000 / 500000 = 1.9
        expect(result.payoutRatio).toBeCloseTo(1.9, 2);
      });
    });

    describe('불균등 배분 케이스', () => {
      it('90:10 베팅 시 소수 쪽이 이기면 배당비율이 높다', () => {
        const result = calculatePayout({
          winner: 'BTC', // 소수 쪽 승리
          totalPool: 1000000,
          totalGoldBets: 900000,
          totalBtcBets: 100000,
          platformFeeRate: 0.05,
        });

        // 950000 / 100000 = 9.5
        expect(result.payoutRatio).toBeCloseTo(9.5, 1);
      });

      it('10:90 베팅 시 다수 쪽이 이기면 배당비율이 낮다', () => {
        const result = calculatePayout({
          winner: 'BTC', // 다수 쪽 승리
          totalPool: 1000000,
          totalGoldBets: 100000,
          totalBtcBets: 900000,
          platformFeeRate: 0.05,
        });

        // 950000 / 900000 ≈ 1.056
        expect(result.payoutRatio).toBeCloseTo(1.056, 2);
      });
    });
  });

  describe('calculateIndividualPayout', () => {
    describe('기본 계산', () => {
      it('개별 배당금을 올바르게 계산한다', () => {
        // 100,000 베팅, 배당비율 1.583
        const payout = calculateIndividualPayout(100000, 1.583);
        expect(payout).toBe(158300); // Math.floor(158300)
      });

      it('배당비율이 2배일 때 2배를 반환한다', () => {
        const payout = calculateIndividualPayout(50000, 2);
        expect(payout).toBe(100000);
      });

      it('배당비율이 1보다 작아도 계산한다', () => {
        // 다수 쪽이 이기면 배당비율이 1보다 작을 수 있음
        const payout = calculateIndividualPayout(100000, 0.9);
        expect(payout).toBe(90000);
      });
    });

    describe('내림 처리', () => {
      it('소수점 이하를 내림 처리한다', () => {
        // 100000 * 1.5833 = 158330
        const payout = calculateIndividualPayout(100000, 1.5833);
        expect(payout).toBe(158330);

        // 100000 * 1.58333 = 158333
        const payout2 = calculateIndividualPayout(100000, 1.58333);
        expect(payout2).toBe(158333);
      });

      it('소수점 배당금도 내림 처리한다', () => {
        // 1 * 1.9 = 1.9 → 1
        const payout = calculateIndividualPayout(1, 1.9);
        expect(payout).toBe(1);
      });
    });

    describe('엣지 케이스', () => {
      it('0 베팅은 0을 반환한다', () => {
        const payout = calculateIndividualPayout(0, 1.5);
        expect(payout).toBe(0);
      });

      it('배당비율 0은 0을 반환한다', () => {
        const payout = calculateIndividualPayout(100000, 0);
        expect(payout).toBe(0);
      });

      it('큰 금액도 정확히 계산한다', () => {
        // 1억 베팅, 배당비율 1.5
        const payout = calculateIndividualPayout(100000000, 1.5);
        expect(payout).toBe(150000000);
      });
    });
  });

  describe('통합 시나리오', () => {
    it('실제 라운드 시나리오: 승자 판정 → 배당 계산 → 개별 배당', () => {
      // 1. 승자 판정
      const winnerResult = determineWinner({
        goldStart: 2650,
        goldEnd: 2680, // +1.13%
        btcStart: 98000,
        btcEnd: 99000, // +1.02%
      });

      expect(winnerResult.winner).toBe('GOLD');

      // 2. 배당 계산
      const payoutResult = calculatePayout({
        winner: winnerResult.winner,
        totalPool: 1000000,
        totalGoldBets: 600000,
        totalBtcBets: 400000,
        platformFeeRate: 0.05,
      });

      expect(payoutResult.platformFee).toBe(50000);
      expect(payoutResult.payoutPool).toBe(950000);

      // 3. 개별 배당 (금에 100,000 베팅한 사람)
      const individualPayout = calculateIndividualPayout(100000, payoutResult.payoutRatio);

      // 100000 * (950000/600000) = 100000 * 1.5833... = 158333
      expect(individualPayout).toBe(158333);
    });

    it('실제 라운드 시나리오: BTC 승리', () => {
      // 1. 승자 판정
      const winnerResult = determineWinner({
        goldStart: 2650,
        goldEnd: 2660, // +0.38%
        btcStart: 98000,
        btcEnd: 100000, // +2.04%
      });

      expect(winnerResult.winner).toBe('BTC');

      // 2. 배당 계산
      const payoutResult = calculatePayout({
        winner: winnerResult.winner,
        totalPool: 1000000,
        totalGoldBets: 700000,
        totalBtcBets: 300000, // 소수 쪽 승리
        platformFeeRate: 0.05,
      });

      // 3. 개별 배당 (BTC에 50,000 베팅한 사람)
      const individualPayout = calculateIndividualPayout(50000, payoutResult.payoutRatio);

      // 50000 * (950000/300000) = 50000 * 3.1666... = 158333
      expect(individualPayout).toBe(158333);
    });
  });
});
