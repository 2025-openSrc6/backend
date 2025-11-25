/**
 * Cron Job 설정
 *
 * 환경변수로 오버라이드 가능한 값과 상수 분리
 */

// ============================================
// 상수 (Constants) - 코드와 함께 변경됨
// ============================================

/**
 * 라운드 시간 설정
 */
export const ROUND_DURATION_MS = 6 * 60 * 60 * 1000; // 6시간
export const BETTING_WINDOW_MS = 60 * 1000; // 1분 (베팅 가능 시간)
export const ROUND_CREATION_LEAD_TIME_MS = 10 * 60 * 1000; // 10분 (라운드 시작 전 생성)

/**
 * KST 기준 라운드 시작 시각 (시 단위)
 * 02:00, 08:00, 14:00, 20:00 KST
 */
export const ROUND_START_HOURS_KST = [2, 8, 14, 20];

/**
 * UTC 기준 라운드 시작 시각 (시 단위)
 * KST -9 = UTC
 * 17:00, 23:00, 05:00, 11:00 UTC
 */
export const ROUND_START_HOURS_UTC = [17, 23, 5, 11];

/**
 * Job 실행 순서 오프셋 (밀리초)
 * Job 4 (Finalize) 먼저, Job 2 (Open) 이후
 */
export const JOB_EXECUTION_OFFSET_MS = {
  FINALIZE: 0, // 정각에 실행
  OPEN: 10 * 1000, // 10초 후 실행
};

// ============================================
// 환경변수 기반 설정 (배포 후 변경 가능)
// ============================================

/**
 * 플랫폼 수수료율
 * 환경변수: PLATFORM_FEE_RATE (기본값: 0.05 = 5%)
 */
export function getPlatformFeeRate(): number {
  const envValue = process.env.PLATFORM_FEE_RATE;
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return 0.05; // 기본값 5%
}

/**
 * Cron Job 재시도 횟수
 * 환경변수: CRON_RETRY_COUNT (기본값: 3)
 */
export function getCronRetryCount(): number {
  const envValue = process.env.CRON_RETRY_COUNT;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 3; // 기본값 3회
}

/**
 * Cron Job 재시도 딜레이 (밀리초)
 * 환경변수: CRON_RETRY_DELAY_MS (기본값: 5000 = 5초)
 */
export function getCronRetryDelayMs(): number {
  const envValue = process.env.CRON_RETRY_DELAY_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 5000; // 기본값 5초
}

/**
 * Recovery Job이 감지하는 "멈춤" 기준 시간 (밀리초)
 * 환경변수: RECOVERY_STUCK_THRESHOLD_MS (기본값: 600000 = 10분)
 */
export function getRecoveryStuckThresholdMs(): number {
  const envValue = process.env.RECOVERY_STUCK_THRESHOLD_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 10 * 60 * 1000; // 기본값 10분
}

/**
 * 가격 API 타임아웃 (밀리초)
 * 환경변수: PRICE_API_TIMEOUT_MS (기본값: 5000 = 5초)
 */
export function getPriceApiTimeoutMs(): number {
  const envValue = process.env.PRICE_API_TIMEOUT_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 5000; // 기본값 5초
}
