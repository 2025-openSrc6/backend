/**
 * GET /api/rounds/current - 현재 활성 라운드 조회
 *
 * 목적: UI에서 가장 많이 사용하는 엔드포인트
 * 용도: 메인 화면에 표시할 현재 진행 중인 라운드 정보
 *
 * 특징:
 * - type별로 현재 활성 라운드 1개만 반환
 * - "활성"의 정의: BETTING_OPEN 또는 BETTING_LOCKED 상태
 * - UI용 추가 계산 필드 포함 (남은 시간, 베팅 비율 등)
 */

import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

/**
 * GET /api/rounds/current
 *
 * Query Parameters:
 * @param type - '1MIN' | '6HOUR' | '1DAY' (필수)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     // 기본 라운드 정보
 *     id, roundNumber, type, status,
 *     startTime, endTime, lockTime,
 *     goldStartPrice, btcStartPrice,
 *     totalPool, totalGoldBets, totalBtcBets, totalBetsCount,
 *
 *     // UI용 추가 필드 (Service에서 계산)
 *     timeRemaining,           // 종료까지 남은 초
 *     bettingTimeRemaining,    // 베팅 마감까지 남은 초
 *     goldBetsPercentage,      // 금 베팅 비율 (%)
 *     btcBetsPercentage,       // BTC 베팅 비율 (%)
 *     canBet,                  // 베팅 가능 여부
 *     bettingClosesIn,         // "MM:SS" 형식
 *   }
 * }
 *
 * Error Cases:
 * - 400: type 파라미터 없음 또는 유효하지 않음 (VALIDATION_ERROR)
 * - 404: 현재 활성 라운드 없음 (NOT_FOUND)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const rawType = searchParams.get('type') ?? undefined;

    // Service Layer에서 검증, 조회, 계산 수행
    const result = await registry.roundService.getCurrentRound(rawType);

    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
