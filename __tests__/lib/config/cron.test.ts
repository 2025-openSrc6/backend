import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ROUND_DURATION_MS,
  BETTING_WINDOW_MS,
  ROUND_CREATION_LEAD_TIME_MS,
  ROUND_START_HOURS_KST,
  ROUND_START_HOURS_UTC,
  JOB_EXECUTION_OFFSET_MS,
  getPlatformFeeRate,
  getCronRetryCount,
  getCronRetryDelayMs,
  getRecoveryStuckThresholdMs,
  getPriceApiTimeoutMs,
} from '@/lib/config/cron';

describe('Cron Config Constants', () => {
  describe('시간 상수', () => {
    it('ROUND_DURATION_MS는 6시간이다', () => {
      expect(ROUND_DURATION_MS).toBe(6 * 60 * 60 * 1000);
      expect(ROUND_DURATION_MS).toBe(21600000);
    });

    it('BETTING_WINDOW_MS는 1분이다', () => {
      expect(BETTING_WINDOW_MS).toBe(60 * 1000);
      expect(BETTING_WINDOW_MS).toBe(60000);
    });

    it('ROUND_CREATION_LEAD_TIME_MS는 10분이다', () => {
      expect(ROUND_CREATION_LEAD_TIME_MS).toBe(10 * 60 * 1000);
      expect(ROUND_CREATION_LEAD_TIME_MS).toBe(600000);
    });
  });

  describe('라운드 시작 시각', () => {
    it('ROUND_START_HOURS_KST는 02, 08, 14, 20시이다', () => {
      expect(ROUND_START_HOURS_KST).toEqual([2, 8, 14, 20]);
    });

    it('ROUND_START_HOURS_UTC는 17, 23, 05, 11시이다', () => {
      expect(ROUND_START_HOURS_UTC).toEqual([17, 23, 5, 11]);
    });

    it('KST와 UTC 시간이 9시간 차이난다', () => {
      // KST 02시 = UTC 17시 (전날)
      expect((ROUND_START_HOURS_KST[0] - 9 + 24) % 24).toBe(ROUND_START_HOURS_UTC[0]);
      // KST 08시 = UTC 23시 (전날)
      expect((ROUND_START_HOURS_KST[1] - 9 + 24) % 24).toBe(ROUND_START_HOURS_UTC[1]);
      // KST 14시 = UTC 05시
      expect((ROUND_START_HOURS_KST[2] - 9 + 24) % 24).toBe(ROUND_START_HOURS_UTC[2]);
      // KST 20시 = UTC 11시
      expect((ROUND_START_HOURS_KST[3] - 9 + 24) % 24).toBe(ROUND_START_HOURS_UTC[3]);
    });
  });

  describe('Job 실행 오프셋', () => {
    it('FINALIZE는 정각에 실행된다', () => {
      expect(JOB_EXECUTION_OFFSET_MS.FINALIZE).toBe(0);
    });

    it('OPEN은 10초 후에 실행된다', () => {
      expect(JOB_EXECUTION_OFFSET_MS.OPEN).toBe(10000);
    });
  });
});

describe('Cron Config Environment Variables', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 각 테스트 전에 환경변수 초기화
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // 테스트 후 원래 환경변수 복원
    process.env = originalEnv;
  });

  describe('getPlatformFeeRate', () => {
    it('환경변수가 없으면 기본값 0.05를 반환한다', () => {
      delete process.env.PLATFORM_FEE_RATE;
      expect(getPlatformFeeRate()).toBe(0.05);
    });

    it('환경변수가 있으면 해당 값을 반환한다', () => {
      process.env.PLATFORM_FEE_RATE = '0.03';
      expect(getPlatformFeeRate()).toBe(0.03);
    });

    it('환경변수가 0이면 0을 반환한다', () => {
      process.env.PLATFORM_FEE_RATE = '0';
      expect(getPlatformFeeRate()).toBe(0);
    });

    it('환경변수가 1이면 1을 반환한다', () => {
      process.env.PLATFORM_FEE_RATE = '1';
      expect(getPlatformFeeRate()).toBe(1);
    });

    it('환경변수가 유효하지 않으면 기본값을 반환한다', () => {
      process.env.PLATFORM_FEE_RATE = 'invalid';
      expect(getPlatformFeeRate()).toBe(0.05);
    });

    it('환경변수가 범위를 벗어나면 기본값을 반환한다 (음수)', () => {
      process.env.PLATFORM_FEE_RATE = '-0.1';
      expect(getPlatformFeeRate()).toBe(0.05);
    });

    it('환경변수가 범위를 벗어나면 기본값을 반환한다 (1 초과)', () => {
      process.env.PLATFORM_FEE_RATE = '1.5';
      expect(getPlatformFeeRate()).toBe(0.05);
    });
  });

  describe('getCronRetryCount', () => {
    it('환경변수가 없으면 기본값 3을 반환한다', () => {
      delete process.env.CRON_RETRY_COUNT;
      expect(getCronRetryCount()).toBe(3);
    });

    it('환경변수가 있으면 해당 값을 반환한다', () => {
      process.env.CRON_RETRY_COUNT = '5';
      expect(getCronRetryCount()).toBe(5);
    });

    it('환경변수가 유효하지 않으면 기본값을 반환한다', () => {
      process.env.CRON_RETRY_COUNT = 'invalid';
      expect(getCronRetryCount()).toBe(3);
    });

    it('환경변수가 0이하면 기본값을 반환한다', () => {
      process.env.CRON_RETRY_COUNT = '0';
      expect(getCronRetryCount()).toBe(3);

      process.env.CRON_RETRY_COUNT = '-1';
      expect(getCronRetryCount()).toBe(3);
    });
  });

  describe('getCronRetryDelayMs', () => {
    it('환경변수가 없으면 기본값 5000을 반환한다', () => {
      delete process.env.CRON_RETRY_DELAY_MS;
      expect(getCronRetryDelayMs()).toBe(5000);
    });

    it('환경변수가 있으면 해당 값을 반환한다', () => {
      process.env.CRON_RETRY_DELAY_MS = '10000';
      expect(getCronRetryDelayMs()).toBe(10000);
    });

    it('환경변수가 유효하지 않으면 기본값을 반환한다', () => {
      process.env.CRON_RETRY_DELAY_MS = 'invalid';
      expect(getCronRetryDelayMs()).toBe(5000);
    });

    it('환경변수가 0이하면 기본값을 반환한다', () => {
      process.env.CRON_RETRY_DELAY_MS = '0';
      expect(getCronRetryDelayMs()).toBe(5000);
    });
  });

  describe('getRecoveryStuckThresholdMs', () => {
    it('환경변수가 없으면 기본값 10분을 반환한다', () => {
      delete process.env.RECOVERY_STUCK_THRESHOLD_MS;
      expect(getRecoveryStuckThresholdMs()).toBe(10 * 60 * 1000);
    });

    it('환경변수가 있으면 해당 값을 반환한다', () => {
      process.env.RECOVERY_STUCK_THRESHOLD_MS = '300000'; // 5분
      expect(getRecoveryStuckThresholdMs()).toBe(300000);
    });

    it('환경변수가 유효하지 않으면 기본값을 반환한다', () => {
      process.env.RECOVERY_STUCK_THRESHOLD_MS = 'invalid';
      expect(getRecoveryStuckThresholdMs()).toBe(600000);
    });
  });

  describe('getPriceApiTimeoutMs', () => {
    it('환경변수가 없으면 기본값 5000을 반환한다', () => {
      delete process.env.PRICE_API_TIMEOUT_MS;
      expect(getPriceApiTimeoutMs()).toBe(5000);
    });

    it('환경변수가 있으면 해당 값을 반환한다', () => {
      process.env.PRICE_API_TIMEOUT_MS = '3000';
      expect(getPriceApiTimeoutMs()).toBe(3000);
    });

    it('환경변수가 유효하지 않으면 기본값을 반환한다', () => {
      process.env.PRICE_API_TIMEOUT_MS = 'invalid';
      expect(getPriceApiTimeoutMs()).toBe(5000);
    });
  });
});

describe('Cron Config 실제 사용 시나리오', () => {
  it('라운드 시간 계산이 올바르다', () => {
    // 라운드 시작 시간
    const roundStartTime = new Date('2025-11-25T02:00:00+09:00').getTime(); // KST 02:00

    // 베팅 마감 시간
    const bettingLockTime = roundStartTime + BETTING_WINDOW_MS;
    expect(new Date(bettingLockTime).toISOString()).toContain('T17:01:00'); // UTC

    // 라운드 종료 시간
    const roundEndTime = roundStartTime + ROUND_DURATION_MS;
    expect(new Date(roundEndTime).toISOString()).toContain('T23:00:00'); // UTC (KST 08:00)
  });

  it('라운드 생성 시간 계산이 올바르다', () => {
    // 라운드 시작 시간
    const roundStartTime = new Date('2025-11-25T02:00:00+09:00').getTime();

    // 라운드 생성 시간 (시작 10분 전)
    const roundCreationTime = roundStartTime - ROUND_CREATION_LEAD_TIME_MS;
    expect(new Date(roundCreationTime).toISOString()).toContain('T16:50:00'); // UTC (KST 01:50)
  });
});
