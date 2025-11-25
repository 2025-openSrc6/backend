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
 * 단순 로직:
 * 1. 가장 최근 BETTING_LOCKED 라운드 1개 찾기
 * 2. endTime <= NOW 확인
 * 3. End Price 스냅샷 가져오기
 * 4. 승자 판정 + 배당 계산
 * 5. 상태 전이 (BETTING_LOCKED → PRICE_PENDING → CALCULATING) - FSM 직접 사용
 * 6. Job 5 트리거
 * 7. 실패 시 → Recovery에서 재시도 (돈이 걸린 Job!)
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job 4] Round Finalizer started');

  try {
    // 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 4] Auth failed');
      return authResult.response;
    }

    const endPriceData: PriceData = {
      gold: 10,
      btc: 1,
      timestamp: Date.now(),
      source: 'mock',
    };
    cronLogger.info('[Job 4] End price data fetched (mock)', {
      gold: endPriceData.gold,
      btc: endPriceData.btc,
      timestamp: new Date(endPriceData.timestamp).toISOString(),
      source: endPriceData.source,
    });

    const result = await registry.roundService.finalizeRound(endPriceData);

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 4] Completed', {
      status: result.status,
      roundId: result.round?.id,
      roundNumber: result.round?.roundNumber,
      durationMs: jobDuration,
    });

    return createSuccessResponse(result);
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 4] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
