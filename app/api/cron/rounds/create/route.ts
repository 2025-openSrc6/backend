import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { NextRequest } from 'next/server';

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
export async function POST(_request: NextRequest) {
  try {
    const jobStartTime = Date.now();
    // 인증 검증
    // 서비스 호출 - 라운드 생성

    const round = await registry.roundService.createNextScheduledRound();

    const jobDuration = Date.now() - jobStartTime;
    console.log(`[Job 1] Completed in ${jobDuration}ms`, {
      roundId: round.id,
      roundNumber: round.roundNumber,
      startTime: round.startTime,
    });

    return createSuccessResponse({ round });
  } catch (error) {
    return handleApiError(error);
  }
}
