import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { cronLogger } from '@/lib/cron/logger';
import { registry } from '@/lib/registry';
import { createSuccessResponse } from '@/lib/shared/response';

/**
 * POST /api/cron/rounds/open
 *
 * Job 2: Round Opener
 *
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();

  const authResult = await verifyCronAuth(request);
  if (!authResult.success) {
    cronLogger.warn('[Job 2] Auth failed');
    return authResult.response;
  }

  // try
  // 가격 스냅샷 가져오기 호출 (현준)
  // - 함수로 받아와야하나 아니면 API 호출을 해야하냐
  // 최근 라운드..? 아니면 전체 SCHEDULED 라운드..?
  // - 앞선 과정에서 충돌위험이 있나?
  // - 이게 근데 그냥 type에 맞는 최근 라운드 가져오면 되나?
  // 상태 전이 함수 호출 w/ 필요한 파라미터
}
