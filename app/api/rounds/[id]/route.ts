/**
 * GET /api/rounds/:id - 특정 라운드 상세 조회
 *
 * 목적: 라운드 ID로 특정 라운드의 상세 정보 조회
 * 용도:
 * - 라운드 상세 페이지
 * - 베팅 내역 조회 시 라운드 정보 표시
 * - 정산 결과 확인
 *
 * 특징:
 * - UUID로 특정 라운드 조회
 * - 모든 상태의 라운드 조회 가능 (SCHEDULED, BETTING_OPEN, SETTLED 등)
 * - 정산 정보 포함 (status=SETTLED인 경우)
 */

import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

/**
 * GET /api/rounds/:id
 *
 * Path Parameters:
 * @param id - 라운드 UUID (필수)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     round: {
 *       // 기본 라운드 정보
 *       id, roundNumber, type, status,
 *       startTime, endTime, lockTime,
 *       goldStartPrice, btcStartPrice,
 *       goldEndPrice?, btcEndPrice?,    // 종료된 경우
 *       totalPool, totalGoldBets, totalBtcBets, totalBetsCount,
 *       winner?,                        // 정산된 경우
 *       createdAt, updatedAt
 *
 *       // TODO: 향후 추가될 필드
 *       // settlement?: {                // status=SETTLED인 경우
 *       //   winner, platformFee, payoutPool,
 *       //   payoutRatio, totalWinners, totalLosers
 *       // },
 *       // goldChangePercent?: string,   // 종료 후 변동률
 *       // btcChangePercent?: string
 *     }
 *   }
 * }
 *
 * Error Cases:
 * - 400: UUID 형식 오류 (VALIDATION_ERROR)
 * - 404: 라운드가 존재하지 않음 (NOT_FOUND)
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Service Layer에서 UUID 검증 및 조회 수행
    const round = await registry.roundService.getRoundById(id);

    return createSuccessResponse({ round });
  } catch (error) {
    return handleApiError(error);
  }
}
