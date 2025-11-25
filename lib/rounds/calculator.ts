/**
 * 라운드 계산 로직
 *
 * 승자 판정 및 배당 계산
 */

import type {
  RoundWinner,
  DetermineWinnerParams,
  DetermineWinnerResult,
  CalculatePayoutParams,
  CalculatePayoutResult,
} from './types';

/**
 * 승자 판정
 *
 * 규칙:
 * - 변동률이 더 높은 자산이 승리
 * - 동률 시 금(GOLD)이 승리 (DRAW 없음)
 *
 * @param params 시작/종료 가격
 * @returns 승자 및 변동률
 */
export function determineWinner(params: DetermineWinnerParams): DetermineWinnerResult {
  const { goldStart, goldEnd, btcStart, btcEnd } = params;

  const goldScaled = (goldEnd - goldStart) / goldStart;
  const btcScaled = (btcEnd - btcStart) / btcStart;

  // 금 변동률 >= 비트 변동률 → 금 승리 (DRAW 시 금)
  const winner: RoundWinner = goldScaled >= btcScaled ? 'GOLD' : 'BTC';

  // 변동률 계산 (%) (리턴용)
  const goldChangePercent = ((goldEnd - goldStart) / goldStart) * 100;
  const btcChangePercent = ((btcEnd - btcStart) / btcStart) * 100;

  return {
    winner,
    goldChangePercent,
    btcChangePercent,
  };
}

/**
 * 배당 계산
 *
 * 로직:
 * 1. 플랫폼 수수료 = 총 풀 × 수수료율
 * 2. 배당 풀 = 총 풀 - 플랫폼 수수료
 * 3. 배당 비율 = 배당 풀 / 승자 풀
 *
 * 예시:
 * - 총 풀: 1,000,000
 * - 금 베팅: 600,000 / BTC 베팅: 400,000
 * - 승자: GOLD
 * - 수수료: 50,000 (5%)
 * - 배당 풀: 950,000
 * - 배당 비율: 950,000 / 600,000 = 1.583
 * - 금에 100,000 베팅한 사람: 100,000 × 1.583 = 158,333 수령
 *
 * @param params 계산 파라미터
 * @returns 배당 계산 결과
 */
export function calculatePayout(params: CalculatePayoutParams): CalculatePayoutResult {
  const { winner, totalPool, totalGoldBets, totalBtcBets, platformFeeRate } = params;

  // 플랫폼 수수료
  const platformFee = Math.floor(totalPool * platformFeeRate);
  const payoutPool = totalPool - platformFee;

  // 승자/패자 풀
  const winningPool = winner === 'GOLD' ? totalGoldBets : totalBtcBets;
  const losingPool = winner === 'GOLD' ? totalBtcBets : totalGoldBets;

  // 배당 비율 (승자가 없으면 0)
  const payoutRatio = winningPool > 0 ? payoutPool / winningPool : 0;

  return {
    platformFee,
    payoutPool,
    payoutRatio,
    winningPool,
    losingPool,
  };
}

/**
 * 개별 베팅 배당금 계산
 *
 * @param betAmount 베팅 금액
 * @param payoutRatio 배당 비율
 * @returns 배당금 (내림 처리)
 */
export function calculateIndividualPayout(betAmount: number, payoutRatio: number): number {
  return Math.floor(betAmount * payoutRatio);
}
