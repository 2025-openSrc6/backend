import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { registry } from '@/lib/registry';
import { PriceData } from '@/lib/rounds/types';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { NextRequest } from 'next/server';

/**
 * POST /api/cron/rounds/finalize
 *
 * Job 4: Round Finalizer
 *
 * 얇은 래퍼 - 실제 로직은 RoundService.finalizeRound()에서 처리
 *
 * 책임:
 * 1. 가격 데이터 가져오기 (현준님 API 또는 Mock)
 * 2. Service 호출 (승자 판정, 배당 계산, 정산 모두 처리됨)
 * 3. 결과 반환
 *
 * Note: Job 5 (정산)는 finalizeRound 내부에서 자동 호출됨
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job 4] Round Finalizer started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 4] Auth failed');
      return authResult.response;
    }

    // 2. End Price 스냅샷 가져오기
    // TODO: 현준님 API 연동 (getPrices() 호출)
    const endPriceData: PriceData = {
      gold: 2680.5, // Mock data - 실제로는 getPrices()
      btc: 99234.0,
      timestamp: Date.now(),
      source: 'mock',
    };

    cronLogger.info('[Job 4] End price data fetched', {
      gold: endPriceData.gold,
      btc: endPriceData.btc,
      source: endPriceData.source,
    });

    // 3. Service 호출 (승자 판정 + 배당 계산 + 정산)
    const result = await registry.roundService.finalizeRound(endPriceData);

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 4] Completed', {
      status: result.status,
      roundId: result.round?.id,
      roundNumber: result.round?.roundNumber,
      durationMs: jobDuration,
    });

    return createSuccessResponse({
      status: result.status,
      round: result.round
        ? {
            id: result.round.id,
            roundNumber: result.round.roundNumber,
            status: result.round.status,
            winner: result.round.winner,
          }
        : undefined,
      message: result.message,
    });
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 4] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    // TODO: Slack 알림 (CRITICAL - 돈이 걸린 Job)
    return handleApiError(error);
  }
}
