/**
 * GET /api/rounds - 라운드 목록 조회 API (원본 + 주석 버전)
 *
 * 이 파일은 현재 구현된 route.ts에 상세 주석을 추가한 버전입니다.
 * 코드 분석 및 리팩토링 전 참고용으로 사용하세요.
 *
 * ⚠️ 문제점:
 * 1. 모든 로직이 route handler에 집중 (250줄)
 * 2. 비즈니스 로직과 HTTP 레이어가 혼재
 * 3. 재사용 불가능 (다른 API에서 사용 불가)
 * 4. 테스트 어려움 (NextRequest에 강하게 결합)
 * 5. 확장성 낮음 (새 필터/정렬 추가 시 파일이 계속 커짐)
 */

import { getDb } from '@/lib/db';
import { rounds } from '@/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// 타입 정의 (types.ts로 분리 권장)
// ============================================================================

/**
 * 라운드 타입 - 베팅 주기를 나타냄
 * - 1MIN: 1분 라운드 (빠른 베팅)
 * - 6HOUR: 6시간 라운드 (메인 게임)
 * - 1DAY: 1일 라운드 (장기 베팅)
 */
const ROUND_TYPES = ['1MIN', '6HOUR', '1DAY'] as const;

/**
 * 라운드 상태 - FSM(Finite State Machine)의 상태
 *
 * 상태 전이 순서:
 * SCHEDULED → BETTING_OPEN → BETTING_LOCKED → PRICE_PENDING
 * → CALCULATING → SETTLED (또는 CANCELLED/VOIDED)
 */
const ROUND_STATUSES = [
  'SCHEDULED',      // 생성됨, 시작 대기 중
  'BETTING_OPEN',   // 베팅 가능 (lockTime 전까지)
  'BETTING_LOCKED', // 베팅 마감, 라운드 진행 중
  'PRICE_PENDING',  // 종료 가격 대기 중
  'CALCULATING',    // 정산 계산 중
  'SETTLED',        // 정산 완료
  'CANCELLED',      // 취소됨 (환불)
  'VOIDED',         // 무효화됨 (무승부)
] as const;

/**
 * 정렬 가능한 필드 매핑
 * 쿼리 파라미터 이름 → DB 컬럼
 */
const SORTABLE_FIELDS = {
  start_time: rounds.startTime,      // 시작 시간으로 정렬
  round_number: rounds.roundNumber,  // 라운드 번호로 정렬
} as const;

// 타입 추론
type RoundType = (typeof ROUND_TYPES)[number];
type RoundStatus = (typeof ROUND_STATUSES)[number];
type SortField = keyof typeof SORTABLE_FIELDS;
type SortOrder = 'asc' | 'desc';

// ============================================================================
// 상수 정의 (constants.ts로 분리 권장)
// ============================================================================

/**
 * 빠른 검색을 위한 Set 변환
 * Array.includes()보다 Set.has()가 O(1)로 더 빠름
 */
const ROUND_TYPE_SET = new Set<string>(ROUND_TYPES);
const ROUND_STATUS_SET = new Set<string>(ROUND_STATUSES);

/**
 * 상태 별칭 (사용자 편의)
 *
 * 쿼리 파라미터에서 간단한 이름 사용 가능
 * 예: ?status=OPEN → BETTING_OPEN으로 변환
 */
const STATUS_ALIAS: Record<string, RoundStatus> = {
  OPEN: 'BETTING_OPEN',
  ACTIVE: 'BETTING_OPEN',
  LOCKED: 'BETTING_LOCKED',
  CLOSED: 'SETTLED',
};

/**
 * 페이지네이션 기본값
 * API_SPECIFICATION.md 참조
 */
const DEFAULT_SORT_FIELD: SortField = 'start_time';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ============================================================================
// GET /api/rounds - 메인 핸들러
// ============================================================================

/**
 * GET /api/rounds
 *
 * 라운드 목록을 조회하고 문서화된 응답 포맷으로 반환합니다.
 *
 * Query Parameters:
 * - type: '1MIN' | '6HOUR' | '1DAY' (선택) → 라운드 주기 필터
 * - status: RoundStatus 또는 alias (선택, 콤마/다중 파라미터 허용) → 상태 필터
 * - page: 기본 1 (정수, 1 이상)
 * - pageSize: 기본 20, 최대 100
 * - sort: 'start_time' | 'round_number' (기본 start_time)
 * - order: 'asc' | 'desc' (기본 desc)
 *
 * Response:
 * {
 *   success: true,
 *   data: { rounds: Round[] },
 *   meta: { page, pageSize, total, totalPages }
 * }
 *
 * ⚠️ 문제점: 이 함수가 너무 많은 책임을 가지고 있음
 * - 요청 파싱
 * - 입력 검증
 * - DB 쿼리 생성
 * - 응답 생성
 * → Service Layer로 분리 필요
 */
export async function GET(request: NextRequest) {
  try {
    // ========================================================================
    // 1. 쿼리 파라미터 파싱
    // ========================================================================
    const { searchParams } = request.nextUrl;

    const typeParam = searchParams.get('type');
    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const rawSort = searchParams.get('sort');
    const rawOrder = searchParams.get('order');

    /**
     * SQL WHERE 절을 담을 배열
     * 나중에 AND로 결합됨
     */
    const filters: SQL[] = [];

    // ========================================================================
    // 2. type 필터 검증 및 적용
    // ========================================================================
    if (typeParam) {
      const normalizedType = typeParam.toUpperCase();

      // 유효한 타입인지 검증
      if (!ROUND_TYPE_SET.has(normalizedType)) {
        return createErrorResponse(400, 'INVALID_QUERY', 'Invalid round type filter provided.', {
          allowedTypes: Array.from(ROUND_TYPE_SET),
        });
      }

      // WHERE 조건 추가
      filters.push(eq(rounds.type, normalizedType as RoundType));
    }

    // ========================================================================
    // 3. status 필터 검증 및 적용 (복수 가능)
    // ========================================================================

    /**
     * status 파라미터는 두 가지 형식 지원:
     * 1. 콤마 구분: ?status=OPEN,LOCKED
     * 2. 복수 파라미터: ?status=OPEN&status=LOCKED
     *
     * getAll()로 모든 값을 가져온 후 콤마로 split하여 flatten
     */
    const rawStatusValues = searchParams
      .getAll('status')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    if (rawStatusValues.length > 0) {
      const normalizedStatuses: RoundStatus[] = [];
      const invalidStatuses: string[] = [];

      // 각 상태값을 정규화 및 검증
      for (const value of rawStatusValues) {
        const normalized = normalizeStatus(value);
        if (normalized) {
          normalizedStatuses.push(normalized);
        } else {
          invalidStatuses.push(value);
        }
      }

      // 유효하지 않은 상태가 있으면 에러 반환
      if (invalidStatuses.length > 0) {
        return createErrorResponse(400, 'INVALID_QUERY', 'Invalid status filter provided.', {
          invalidStatuses,
        });
      }

      // 중복 제거
      const uniqueStatuses = Array.from(new Set(normalizedStatuses));

      // WHERE 조건 추가
      // 단일 상태: eq 사용, 복수 상태: inArray 사용
      filters.push(
        uniqueStatuses.length === 1
          ? eq(rounds.status, uniqueStatuses[0])
          : inArray(rounds.status, uniqueStatuses),
      );
    }

    // ========================================================================
    // 4. 페이지네이션 파라미터 검증
    // ========================================================================

    let page = DEFAULT_PAGE;
    if (rawPage !== null) {
      const parsedPage = Number(rawPage);

      // 정수이고 1 이상인지 검증
      if (!Number.isInteger(parsedPage) || parsedPage < 1) {
        return createErrorResponse(
          400,
          'INVALID_QUERY',
          "'page' must be an integer greater than 0.",
        );
      }

      page = parsedPage;
    }

    let pageSize = DEFAULT_PAGE_SIZE;
    if (rawPageSize !== null) {
      const parsedPageSize = Number(rawPageSize);

      // 정수이고 1~MAX_PAGE_SIZE 범위인지 검증
      if (
        !Number.isInteger(parsedPageSize) ||
        parsedPageSize < 1 ||
        parsedPageSize > MAX_PAGE_SIZE
      ) {
        return createErrorResponse(
          400,
          'INVALID_QUERY',
          `"pageSize" must be between 1 and ${MAX_PAGE_SIZE}.`,
        );
      }

      pageSize = parsedPageSize;
    }

    /**
     * offset 계산
     * 예: page=2, pageSize=20 → offset=20
     */
    const offset = (page - 1) * pageSize;

    // ========================================================================
    // 5. 정렬 파라미터 검증
    // ========================================================================

    const sortFieldCandidate = rawSort ? rawSort.toLowerCase() : DEFAULT_SORT_FIELD;

    // 정렬 필드 검증
    if (!isValidSortField(sortFieldCandidate)) {
      return createErrorResponse(400, 'INVALID_QUERY', 'Invalid sort field provided.', {
        allowedSorts: Object.keys(SORTABLE_FIELDS),
      });
    }
    const sortField: SortField = sortFieldCandidate;

    const sortOrderCandidate = rawOrder ? rawOrder.toLowerCase() : DEFAULT_SORT_ORDER;

    // 정렬 순서 검증
    if (!isValidSortOrder(sortOrderCandidate)) {
      return createErrorResponse(400, 'INVALID_QUERY', 'Invalid order value provided.', {
        allowedOrders: ['asc', 'desc'],
      });
    }
    const sortOrder: SortOrder = sortOrderCandidate;

    // ========================================================================
    // 6. DB 쿼리 실행
    // ⚠️ 문제점: Repository Layer로 분리 필요
    // ========================================================================

    const db = getDb();

    // WHERE 절 구성
    const whereClause = buildWhereClause(filters);

    // ORDER BY 표현식 구성
    const orderByExpression =
      sortOrder === 'asc' ? asc(SORTABLE_FIELDS[sortField]) : desc(SORTABLE_FIELDS[sortField]);

    // 라운드 목록 쿼리
    let roundsQuery = db.select().from(rounds);
    if (whereClause) {
      roundsQuery = roundsQuery.where(whereClause);
    }

    const roundRows = await roundsQuery.orderBy(orderByExpression).limit(pageSize).offset(offset);

    // 총 개수 쿼리 (페이지네이션용)
    let countQuery = db.select({ value: sql<number>`count(*)` }).from(rounds);
    if (whereClause) {
      countQuery = countQuery.where(whereClause);
    }

    const countResult = await countQuery;
    const total = countResult[0]?.value ?? 0;

    // 총 페이지 수 계산
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    // ========================================================================
    // 7. 성공 응답 반환
    // ========================================================================

    return NextResponse.json({
      success: true,
      data: { rounds: roundRows },
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    // ========================================================================
    // 8. 에러 처리
    // ⚠️ 문제점: 에러 처리 로직을 공통 유틸로 분리 필요
    // ========================================================================
    console.error('GET /api/rounds error:', error);
    return createErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}

// ============================================================================
// 헬퍼 함수들 (별도 파일로 분리 권장)
// ============================================================================

/**
 * 상태 별칭을 정규화
 *
 * @param value - 사용자 입력 (예: 'open', 'OPEN', 'BETTING_OPEN')
 * @returns 정규화된 상태 또는 null
 *
 * @example
 * normalizeStatus('open') → 'BETTING_OPEN'
 * normalizeStatus('BETTING_OPEN') → 'BETTING_OPEN'
 * normalizeStatus('invalid') → null
 *
 * ⚠️ 문제점: Service Layer로 이동 필요
 */
function normalizeStatus(value: string): RoundStatus | null {
  const upperValue = value.toUpperCase();
  const normalized = STATUS_ALIAS[upperValue] ?? upperValue;
  return ROUND_STATUS_SET.has(normalized) ? (normalized as RoundStatus) : null;
}

/**
 * 정렬 필드 타입 가드
 */
function isValidSortField(field: string): field is SortField {
  return field === 'start_time' || field === 'round_number';
}

/**
 * 정렬 순서 타입 가드
 */
function isValidSortOrder(order: string): order is SortOrder {
  return order === 'asc' || order === 'desc';
}

/**
 * WHERE 절 빌더
 *
 * 필터 배열을 AND로 결합
 *
 * @example
 * buildWhereClause([eq(rounds.type, '6HOUR'), eq(rounds.status, 'BETTING_OPEN')])
 * → WHERE type = '6HOUR' AND status = 'BETTING_OPEN'
 *
 * ⚠️ 문제점: Repository Layer로 이동 필요
 */
function buildWhereClause(filters: SQL[]): SQL | undefined {
  if (filters.length === 0) {
    return undefined;
  }
  if (filters.length === 1) {
    return filters[0];
  }
  return and(...filters);
}

/**
 * 에러 응답 생성 헬퍼
 *
 * API_SPECIFICATION.md의 "에러 응답" 포맷 참조
 *
 * ⚠️ 문제점: lib/shared/response.ts로 이동 필요
 */
function createErrorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

// ============================================================================
// 요약: 리팩토링 권장 사항
// ============================================================================

/**
 * 현재 구조의 문제점:
 *
 * 1. 단일 책임 원칙 위반
 *    - route.ts가 HTTP 처리 + 검증 + DB 쿼리 + 에러 처리 모두 담당
 *    - 250줄이 넘는 단일 파일
 *
 * 2. 재사용 불가능
 *    - /api/rounds/current, /api/rounds/:id에서 같은 로직 중복 예상
 *    - 다른 API (bets, users)에서 유사한 패턴 필요
 *
 * 3. 테스트 어려움
 *    - NextRequest/NextResponse에 강하게 결합
 *    - 비즈니스 로직만 테스트 불가능
 *
 * 4. 확장성 낮음
 *    - 새로운 필터/정렬 추가 시 route.ts가 계속 비대해짐
 *    - 코드 가독성 저하
 *
 * 권장 리팩토링:
 *
 * 1. Layered Architecture 적용
 *    - Controller (route.ts): HTTP 처리만
 *    - Service (service.ts): 비즈니스 로직
 *    - Repository (repository.ts): DB 접근
 *
 * 2. 파일 분리
 *    - lib/rounds/types.ts: 타입 정의
 *    - lib/rounds/constants.ts: 상수
 *    - lib/rounds/validation.ts: Zod schemas
 *    - lib/rounds/repository.ts: DB 쿼리
 *    - lib/rounds/service.ts: 비즈니스 로직
 *    - lib/shared/errors.ts: 에러 클래스
 *    - lib/shared/response.ts: 응답 헬퍼
 *
 * 3. 의존성 주입
 *    - Service에 Repository 주입
 *    - 테스트 시 Mock 주입 가능
 *
 * 4. Zod 검증
 *    - 런타임 타입 안전성
 *    - 자동 에러 메시지 생성
 *
 * 참고:
 * - route.refactored.ts: 리팩토링된 버전
 * - docs/ehdnd/ARCHITECTURE_GUIDE.md: 아키텍처 가이드
 */
