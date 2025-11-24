import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

/**
 * POST /api/cron/rounds/create
 *
 * Job 1: Round Creator
 * - 일단은 6시간 라운드만 고려
 * - cron job handler에서 호출
 *
 * 실행 주기: 매일 4회 (라운드 시작 10분 전)
 *
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();

  const authResult = await verifyCronAuth(request);
  if (!authResult.success) {
    cronLogger.warn('[Job 1] Auth failed');
    return authResult.response;
  }

  try {
    const round = await registry.roundService.createNextScheduledRound();

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 1] Completed', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      startTime: round.startTime,
      durationMs: jobDuration,
    });

    return createSuccessResponse({ round });
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 1] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
