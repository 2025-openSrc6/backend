/**
 * GET /api/rounds - 라운드 목록 조회 API (리팩토링 예시)
 *
 * Controller Layer: HTTP 요청/응답만 처리
 * 모든 비즈니스 로직은 RoundService로 위임
 *
 * 의존성: lib/registry.ts에서 조립된 Service 사용
 *
 * 특징:
 * - registry.roundService 사용 (직접 new 하지 않음)
 * - 의존성 조립은 lib/registry.ts에서 일괄 관리
 * - Controller는 HTTP 처리만 집중
 */

import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import {
  createSuccessResponse,
  createSuccessResponseWithMeta,
  handleApiError,
} from '@/lib/shared/response';

/**
 * GET /api/rounds
 *
 * 라운드 목록을 조회하고 페이지네이션된 결과를 반환합니다.
 *
 * Query Parameters:
 * - type: '1MIN' | '6HOUR' | '1DAY' (선택)
 * - status: RoundStatus (선택, 콤마/다중 파라미터 허용)
 * - page: 페이지 번호 (기본: 1)
 * - pageSize: 페이지 크기 (기본: 20, 최대: 100)
 * - sort: 'start_time' | 'round_number' (기본: start_time)
 * - order: 'asc' | 'desc' (기본: desc)
 *
 * Response:
 * {
 *   success: true,
 *   data: { rounds: Round[] },
 *   meta: { page, pageSize, total, totalPages }
 * }
 *
 * 에러 Response:
 * {
 *   success: false,
 *   error: { code, message, details? }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 쿼리 파라미터 파싱
    const params = parseQueryParams(request);

    // 2. Service 호출 (registry에서 조립된 인스턴스 사용)
    const result = await registry.roundService.getRounds(params);

    // 3. 성공 응답 반환
    return createSuccessResponseWithMeta({ rounds: result.rounds }, result.meta);
  } catch (error) {
    // 4. 에러 처리 (Service 에러 → HTTP 응답)
    return handleApiError(error);
  }
}

/**
 * POST /api/rounds
 *
 * 새 라운드를 생성합니다 (Admin 전용).
 *
 * Request Body:
 * {
 *   type: '6HOUR',              // 라운드 타입 (필수)
 *   startTime: 1700000000000    // 시작 시각 Epoch milliseconds (필수)
 * }
 *
 * 참고: endTime과 lockTime은 type에 따라 자동 계산됨
 * - endTime = startTime + ROUND_DURATIONS[type]
 * - lockTime = startTime + BETTING_DURATIONS[type]
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     round: {
 *       id: "uuid",
 *       roundNumber: 43,         // 자동 증가
 *       status: "SCHEDULED",     // 초기 상태
 *       startTime: 1700000000000,
 *       endTime: 1700021600000,  // 자동 계산
 *       lockTime: 1700000060000, // 자동 계산
 *       // ... (전체 라운드 정보)
 *     }
 *   }
 * }
 *
 * 에러 Response:
 * {
 *   success: false,
 *   error: {
 *     code: "DUPLICATE_ROUND" | "VALIDATION_ERROR" | ...,
 *     message: "에러 메시지",
 *     details?: { ... }
 *   }
 * }
 *
 * 권한: Admin 필요 (TODO: 인증 미들웨어 추가)
 *
 * 구현 로드맵: docs/ehdnd/POST_ROUNDS_IMPLEMENTATION.md 참고
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Request Body 파싱
    const body = await request.json();

    // TODO: 2. 권한 체크 (Admin 전용)
    // const session = await getSession(request);
    // if (!session || session.role !== 'ADMIN') {
    //   throw new ForbiddenError('Admin role required');
    // }

    // 3. Service 호출 (registry에서 조립된 인스턴스 사용)
    // Service에서 다음 작업 수행:
    // - 입력 검증 (Zod)
    // - endTime, lockTime 자동 계산
    // - roundNumber 자동 증가
    // - 중복 시간대 체크
    // - DB 삽입
    const round = await registry.roundService.createRound(body);

    // 4. 성공 응답 반환
    return createSuccessResponse({ round });
  } catch (error) {
    // 5. 에러 처리 (Service 에러 → HTTP 응답)
    return handleApiError(error);
  }
}

/**
 * 쿼리 파라미터를 파싱하여 Service에 전달할 객체로 변환
 *
 * Service에서 Zod로 검증하므로 여기서는 간단히 파싱만 수행
 *
 * @private
 */
function parseQueryParams(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // status 파라미터는 콤마 구분 또는 복수 파라미터 지원
  // 예: ?status=BETTING_OPEN,BETTING_LOCKED 또는 ?status=BETTING_OPEN&status=BETTING_LOCKED
  const rawStatusValues = searchParams
    .getAll('status')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const statuses = rawStatusValues.length > 0 ? rawStatusValues : undefined;

  return {
    type: searchParams.get('type') ?? undefined,
    statuses,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    order: searchParams.get('order') ?? undefined,
  };
}
