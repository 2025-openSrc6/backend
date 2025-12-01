import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';

/**
 * POST /api/cron/recovery
 *
 * Job 6: Recovery & Monitoring (시간 기반)
 *
 * 돈이 걸린 Job의 실패를 복구:
 * 1. CALCULATING 상태 + 10분 이상 지속된 라운드 찾기
 * 2. 10분~30분: settleRound() 재시도
 * 3. 30분 이상: Slack CRITICAL 알림 + 포기
 *
 * Route는 얇게 유지. 모든 로직은 Service에서 처리.
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();

  try {
    // 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 6] Auth failed');
      return authResult.response;
    }

    // Service 호출 (모든 로직은 Service에서)
    const result = await registry.roundService.recoveryRounds();

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 6] Completed', { durationMs: jobDuration, ...result });

    return createSuccessResponse(result);
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 6] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
