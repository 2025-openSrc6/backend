import { NextRequest, NextResponse } from 'next/server';
import { cronLogger } from '@/lib/cron/logger';
import { ROUND_START_HOURS_UTC } from '@/lib/config/cron';

/**
 * GET /api/cron/scheduled
 *
 * Cloudflare Workers Cron Handler
 *
 * Cloudflare Workers scheduled event가 이 핸들러를 트리거합니다.
 * 각 Cron Job API를 내부 호출하여 실행합니다.
 *
 * 실행 시각 (UTC):
 * - 매시 50분 (16, 22, 4, 10): Job 1 (Round Creator)
 * - 매시 0분 (17, 23, 5, 11): Job 4 (Finalize) → Job 2 (Open) 순차 실행
 * - 매시 1분 (17, 23, 5, 11): Job 3 (Betting Locker)
 * - 매분: Job 6 (Recovery)
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const now = new Date();
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();

  cronLogger.info('Scheduled handler triggered', { hour, minute });

  // Job 결정
  const jobs: string[] = [];
  const results: { job: string; status: number; success: boolean; error?: string }[] = [];

  // UTC 기준 라운드 시작 전 10분 (16, 22, 4, 10시)
  const creatorHours = ROUND_START_HOURS_UTC.map((h) => (h - 1 + 24) % 24);

  // Job 1: Round Creator (라운드 시작 10분 전)
  if (minute === 50 && creatorHours.includes(hour)) {
    jobs.push('/api/cron/rounds/create');
  }

  // Job 4 (Finalize) + Job 2 (Open): 라운드 시작/종료 시각
  // 중요: Job 4가 먼저 실행되어야 함 (이전 라운드 정산 > 새 라운드 시작)
  if (minute === 0 && ROUND_START_HOURS_UTC.includes(hour)) {
    // Job 4: 이전 라운드 종료/정산 (먼저 실행)
    const finalizeResult = await callCronJob(baseUrl, '/api/cron/rounds/finalize', cronSecret!);
    results.push({ job: 'finalize', ...finalizeResult });

    // Job 2: 새 라운드 시작 (이후 실행)
    const openResult = await callCronJob(baseUrl, '/api/cron/rounds/open', cronSecret!);
    results.push({ job: 'open', ...openResult });
  }

  // Job 3: Betting Locker (라운드 시작 1분 후)
  if (minute === 1 && ROUND_START_HOURS_UTC.includes(hour)) {
    jobs.push('/api/cron/rounds/lock');
  }

  // Job 6: Recovery (매분)
  jobs.push('/api/cron/recovery');

  // 나머지 Job 실행 (병렬)
  const parallelResults = await Promise.allSettled(
    jobs.map(async (job) => {
      const result = await callCronJob(baseUrl, job, cronSecret!);
      return { job, ...result };
    }),
  );

  // 결과 수집
  parallelResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        job: 'unknown',
        status: 500,
        success: false,
        error: result.reason?.message || 'Unknown error',
      });
    }
  });

  cronLogger.info('Scheduled handler completed', {
    hour,
    minute,
    jobsRun: results.length,
    results: results.map((r) => ({ job: r.job, status: r.status, success: r.success })),
  });

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    results,
  });
}

/**
 * Cron Job API 호출 헬퍼
 */
async function callCronJob(
  baseUrl: string,
  path: string,
  cronSecret: string,
): Promise<{ status: number; success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'X-Cron-Secret': cronSecret,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      cronLogger.error(`Job ${path} failed`, {
        status: response.status,
        error: data?.error?.message,
      });
      return {
        status: response.status,
        success: false,
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }

    cronLogger.info(`Job ${path} completed`, { status: response.status });
    return { status: response.status, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    cronLogger.error(`Job ${path} error`, { error: message });
    return { status: 500, success: false, error: message };
  }
}
