import { cronLogger } from '@/lib/cron/logger';
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { registry } from '@/lib/registry';

/**
 * POST /api/cron/rounds/lock
 *
 * Job 3: Betting Locker
 *
 * 단순 로직:
 * 1. 가장 최근 BETTING_OPEN 라운드 1개 찾기
 * 2. lockTime <= NOW 확인
 * 3. 상태 전이 (BETTING_OPEN → BETTING_LOCKED) - FSM 직접 사용
 * 4. 실패해도 API에서 막고 있으니 치명적이지 않음
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job 3] Started', { jobStartTime });

  try {
    // 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 3] Auth failed');
      return authResult.response;
    }

    const result = await registry.roundService.lockRound();

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 3] Completed', {
      status: result.status,
      roundId: result.round?.id,
      roundNumber: result.round?.roundNumber,
      durationMs: jobDuration,
    });

    return createSuccessResponse(result);
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 3] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
