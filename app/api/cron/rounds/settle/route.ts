import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { registry } from '@/lib/registry';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { ValidationError } from '@/lib/shared/errors';
import { NextRequest } from 'next/server';

/**
 * POST /api/cron/rounds/settle
 *
 * Job 5: Settlement Processor
 *
 * 얇은 래퍼 - 실제 로직은 RoundService.settleRound()에서 처리
 *
 * 호출 방식:
 * - 주로 Job 4에서 내부 서비스 호출로 실행됨 (HTTP 아님)
 * - 이 Route는 Recovery나 수동 재시도용
 *
 * @example
 * // Recovery에서
 * POST /api/cron/rounds/settle
 * Body: { roundId: "uuid-here" }
 * Header: X-Cron-Secret: xxx
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 5] Auth failed');
      return authResult.response;
    }

    // 2. Body 파싱
    const body = await request.json();
    const { roundId } = body;

    if (!roundId || typeof roundId !== 'string') {
      throw new ValidationError('roundId is required', { roundId });
    }

    cronLogger.info('[Job 5] Starting settlement', { roundId });

    // 3. Service 호출 (모든 로직은 여기서)
    const result = await registry.roundService.settleRound(roundId);

    // 4. 결과 반환
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 5] Completed', {
      roundId,
      status: result.status,
      durationMs: jobDuration,
    });

    switch (result.status) {
      case 'settled':
      case 'already_settled':
      case 'no_bets':
        return createSuccessResponse({
          roundId: result.roundId,
          status: result.status,
          settledCount: result.settledCount,
          failedCount: result.failedCount,
          totalPayout: result.totalPayout,
          message: result.message,
        });
      case 'partial':
        return createErrorResponse(
          500,
          'PARTIAL_SETTLEMENT',
          result.message ?? 'Settlement partially completed',
          {
            roundId: result.roundId,
            settledCount: result.settledCount,
            failedCount: result.failedCount,
            totalPayout: result.totalPayout,
            status: result.status,
          },
        );
      case 'failed':
        return createErrorResponse(
          500,
          'SETTLEMENT_FAILED',
          result.message ?? 'Settlement failed',
          {
            roundId: result.roundId,
            status: result.status,
            settledCount: result.settledCount,
            failedCount: result.failedCount,
          },
        );
      default:
        return createErrorResponse(500, 'UNKNOWN_STATUS', 'Unknown settleRound status', {
          roundId: result.roundId,
          status: result.status,
        });
    }
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 5] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    // TODO: Slack 알림 (CRITICAL - 돈이 걸린 Job)
    return handleApiError(error);
  }
}
