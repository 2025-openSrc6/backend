import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { registry } from '@/lib/registry';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { PriceData } from '@/lib/rounds/types';

/**
 * POST /api/cron/rounds/open
 *
 * Job 2: Round Opener
 *
 * Route 책임:
 * - 인증 검증
 * - 외부 API 호출 (가격 데이터)
 * - Service 호출
 * - 응답 포맷팅
 *
 * Service 책임 (openRound):
 * - 라운드 조회
 * - 시간 검증 (startTime, lockTime)
 * - 상태 전이 (FSM 호출)
 * - 취소 처리
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job 2] Started', { jobStartTime });

  try {
    // 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 2] Auth failed');
      return authResult.response;
    }
    cronLogger.info('[Job 2] Auth success');

    // 가격 스냅샷 가져오기 (외부 API 호출)
    // TODO: 현준에게 받아서 수정하기
    const prices: PriceData = {
      gold: 2650.5,
      btc: 98234.0,
      timestamp: Date.now(),
      source: 'kitco',
    };
    cronLogger.info('[Job 2] Prices fetched (mock)', {
      gold: prices.gold,
      btc: prices.btc,
      timestamp: new Date(prices.timestamp).toISOString(),
      source: prices.source,
    });

    // Service에 위임 (라운드 조회 + 시간 검증 + 상태 전이)
    const result = await registry.roundService.openRound(prices);

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 2] Completed', {
      status: result.status,
      roundId: result.round?.id,
      roundNumber: result.round?.roundNumber,
      durationMs: jobDuration,
    });

    // 응답 반환 - 실패 상태는 success:false + 비 2xx로 응답
    switch (result.status) {
      case 'opened':
        return createSuccessResponse(result);
      case 'no_round':
        return createErrorResponse(
          404,
          'NO_SCHEDULED_ROUND',
          result.message ?? 'No scheduled round found',
        );
      case 'not_ready':
        return createErrorResponse(
          409,
          'ROUND_NOT_READY',
          result.message ?? 'Round not ready yet (startTime not reached)',
          {
            roundId: result.round?.id,
            roundNumber: result.round?.roundNumber,
            startTime: result.round ? new Date(result.round.startTime).toISOString() : undefined,
            lockTime: result.round ? new Date(result.round.lockTime).toISOString() : undefined,
            now: new Date().toISOString(),
          },
        );
      case 'cancelled':
        return createErrorResponse(
          409,
          'ROUND_CANCELLED',
          result.message ?? 'Round cancelled (missed open window)',
          {
            roundId: result.round?.id,
            roundNumber: result.round?.roundNumber,
          },
        );
      default:
        return createErrorResponse(500, 'UNKNOWN_STATUS', 'Unknown openRound status');
    }
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 2] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    // TODO: 필요 시 Slack 알림 (복구 안함)

    return handleApiError(error);
  }
}
