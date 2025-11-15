import { getDbFromContext } from '@/lib/db';
import { rounds } from '@/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { NextContext } from '@/lib/types';

const ROUND_TYPES = ['1MIN', '6HOUR', '1DAY'] as const;
const ROUND_STATUSES = [
  'SCHEDULED',
  'BETTING_OPEN',
  'BETTING_LOCKED',
  'PRICE_PENDING',
  'CALCULATING',
  'SETTLED',
  'CANCELLED',
  'VOIDED',
] as const;

const SORTABLE_FIELDS = {
  start_time: rounds.startTime,
  round_number: rounds.roundNumber,
} as const;

type RoundType = (typeof ROUND_TYPES)[number];
type RoundStatus = (typeof ROUND_STATUSES)[number];
type SortField = keyof typeof SORTABLE_FIELDS;
type SortOrder = 'asc' | 'desc';

const ROUND_TYPE_SET = new Set<string>(ROUND_TYPES);
const ROUND_STATUS_SET = new Set<string>(ROUND_STATUSES);

const STATUS_ALIAS: Record<string, RoundStatus> = {
  OPEN: 'BETTING_OPEN',
  ACTIVE: 'BETTING_OPEN',
  LOCKED: 'BETTING_LOCKED',
  CLOSED: 'SETTLED',
};

const DEFAULT_SORT_FIELD: SortField = 'start_time';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/rounds
 * 라운드 목록을 조회하고 문서화된 응답 포맷으로 반환합니다.
 *
 * Query Parameters
 * - type: '1MIN' | '6HOUR' | '1DAY' (선택) → 라운드 주기 필터
 * - status: RoundStatus 또는 alias (선택, 콤마/다중 파라미터 허용) → 상태 필터
 * - page: 기본 1 (정수, 1 이상)
 * - pageSize: 기본 20, 최대 100
 * - sort: 'start_time' | 'round_number' (기본 start_time)
 * - order: 'asc' | 'desc' (기본 desc)
 *
 * Response
 * {
 *   success: true,
 *   data: { rounds: Round[] },
 *   meta: { page, pageSize, total, totalPages }
 * }
 */
export async function GET(request: NextRequest, context: NextContext) {
  try {
    const { searchParams } = request.nextUrl;

    const typeParam = searchParams.get('type');
    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const rawSort = searchParams.get('sort');
    const rawOrder = searchParams.get('order');

    const filters: SQL[] = [];

    // Validate & normalize type filter
    if (typeParam) {
      const normalizedType = typeParam.toUpperCase();
      if (!ROUND_TYPE_SET.has(normalizedType)) {
        return createErrorResponse(400, 'INVALID_QUERY', 'Invalid round type filter provided.', {
          allowedTypes: Array.from(ROUND_TYPE_SET),
        });
      }
      filters.push(eq(rounds.type, normalizedType as RoundType));
    }

    // Validate & normalize status filters (comma-separated or repeated query params)
    const rawStatusValues = searchParams
      .getAll('status')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    if (rawStatusValues.length > 0) {
      const normalizedStatuses: RoundStatus[] = [];
      const invalidStatuses: string[] = [];

      for (const value of rawStatusValues) {
        const normalized = normalizeStatus(value);
        if (normalized) {
          normalizedStatuses.push(normalized);
        } else {
          invalidStatuses.push(value);
        }
      }

      if (invalidStatuses.length > 0) {
        return createErrorResponse(400, 'INVALID_QUERY', 'Invalid status filter provided.', {
          invalidStatuses,
        });
      }

      const uniqueStatuses = Array.from(new Set(normalizedStatuses));
      filters.push(
        uniqueStatuses.length === 1
          ? eq(rounds.status, uniqueStatuses[0])
          : inArray(rounds.status, uniqueStatuses),
      );
    }

    // Pagination validation
    let page = DEFAULT_PAGE;
    if (rawPage !== null) {
      const parsedPage = Number(rawPage);
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

    const offset = (page - 1) * pageSize;

    // Sorting validation
    const sortFieldCandidate = rawSort ? rawSort.toLowerCase() : DEFAULT_SORT_FIELD;
    if (!isValidSortField(sortFieldCandidate)) {
      return createErrorResponse(400, 'INVALID_QUERY', 'Invalid sort field provided.', {
        allowedSorts: Object.keys(SORTABLE_FIELDS),
      });
    }
    const sortField: SortField = sortFieldCandidate;

    const sortOrderCandidate = rawOrder ? rawOrder.toLowerCase() : DEFAULT_SORT_ORDER;
    if (!isValidSortOrder(sortOrderCandidate)) {
      return createErrorResponse(400, 'INVALID_QUERY', 'Invalid order value provided.', {
        allowedOrders: ['asc', 'desc'],
      });
    }
    const sortOrder: SortOrder = sortOrderCandidate;

    const db = getDbFromContext(context);
    const whereClause = buildWhereClause(filters);
    const orderByExpression =
      sortOrder === 'asc' ? asc(SORTABLE_FIELDS[sortField]) : desc(SORTABLE_FIELDS[sortField]);

    let roundsQuery = db.select().from(rounds);
    if (whereClause) {
      roundsQuery = roundsQuery.where(whereClause);
    }

    const roundRows = await roundsQuery.orderBy(orderByExpression).limit(pageSize).offset(offset);

    let countQuery = db.select({ value: sql<number>`count(*)` }).from(rounds);
    if (whereClause) {
      countQuery = countQuery.where(whereClause);
    }

    const countResult = await countQuery;
    const total = countResult[0]?.value ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

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
    console.error('GET /api/rounds error:', error);
    return createErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
}

function normalizeStatus(value: string): RoundStatus | null {
  const upperValue = value.toUpperCase();
  const normalized = STATUS_ALIAS[upperValue] ?? upperValue;
  return ROUND_STATUS_SET.has(normalized) ? (normalized as RoundStatus) : null;
}

function isValidSortField(field: string): field is SortField {
  return field === 'start_time' || field === 'round_number';
}

function isValidSortOrder(order: string): order is SortOrder {
  return order === 'asc' || order === 'desc';
}

function buildWhereClause(filters: SQL[]): SQL | undefined {
  if (filters.length === 0) {
    return undefined;
  }
  if (filters.length === 1) {
    return filters[0];
  }
  return and(...filters);
}

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
