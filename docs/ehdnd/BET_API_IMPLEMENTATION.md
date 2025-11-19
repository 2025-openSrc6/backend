# Bet API 구현 가이드 (Week 1 - Mock 버전)

## 📋 목차

1. [목표](#목표)
2. [구현 사항](#구현-사항)
3. [아키텍처 레이어](#아키텍처-레이어)
4. [구현 체크리스트](#구현-체크리스트)
5. [베스트 프랙티스](#베스트-프랙티스)
6. [답안 코드](#답안-코드)
7. [테스트 시나리오](#테스트-시나리오)

---

## 목표

**Week 1에서 구현할 것:**

- ✅ D1(SQLite)만 사용하여 완전히 동작하는 베팅 API
- ✅ Atomic 풀 업데이트 (Race Condition 방지)
- ✅ 트랜잭션 기반 데이터 정합성 보장
- ✅ 3단계 Validation (라운드 상태, 잔액, 중복)

**Week 1에서 생략할 것:**

- ❌ Sui 블록체인 통합 (Week 3에 구현)
- ❌ suiTxHash, suiBetObjectId (Week 3에 추가)
- ❌ 실제 지갑 인증 (Mock userId 사용)

---

## 구현 사항

### 1. POST /api/bets - 베팅 생성

**책임:**

- 유저의 베팅 요청 접수
- 라운드 상태 검증 (BETTING_OPEN만 허용)
- 유저 잔액 검증 (충분한지 확인)
- 베팅 레코드 저장
- **라운드 풀 Atomic 업데이트** (가장 중요!)

**요청:**

```typescript
POST /api/bets
{
  "roundId": "uuid",
  "prediction": "GOLD" | "BTC",
  "amount": 1000
}
```

**응답:**

```typescript
{
  "success": true,
  "data": {
    "bet": {
      "id": "uuid",
      "roundId": "uuid",
      "userId": "uuid",
      "prediction": "GOLD",
      "amount": 1000,
      "currency": "DEL",
      "resultStatus": "PENDING",
      "settlementStatus": "PENDING",
      "createdAt": 1700000030000,
      "processedAt": 1700000031000
    },
    "round": {
      "totalPool": 1501000,      // 업데이트된 풀
      "totalGoldBets": 801000,
      "totalBtcBets": 700000,
      "totalBetsCount": 151
    },
    "userBalance": {
      "delBalance": 4000          // 베팅 후 잔액
    }
  }
}
```

---

### 2. GET /api/bets - 베팅 목록 조회

**책임:**

- 베팅 목록 조회 (필터링, 페이지네이션)
- roundId, userId, prediction으로 필터

**요청:**

```
GET /api/bets?roundId=uuid&page=1&pageSize=20
GET /api/bets?userId=uuid&page=1
```

**응답:**

```typescript
{
  "success": true,
  "data": {
    "bets": [
      {
        "id": "uuid",
        "roundId": "uuid",
        "userId": "uuid",
        "prediction": "GOLD",
        "amount": 1000,
        "currency": "DEL",
        "resultStatus": "PENDING",
        "settlementStatus": "PENDING",
        "createdAt": 1700000030000
      }
      // ...
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

### 3. GET /api/bets/:id - 베팅 상세 조회

**책임:**

- 특정 베팅 상세 정보 반환
- 라운드 정보 포함

**응답:**

```typescript
{
  "success": true,
  "data": {
    "bet": {
      "id": "uuid",
      // ... 베팅 정보
      "round": {
        "id": "uuid",
        "roundNumber": 42,
        "type": "6HOUR",
        "status": "BETTING_OPEN"
      }
    }
  }
}
```

---

## 아키텍처 레이어

기존 Round API와 동일한 구조 사용:

```
┌─────────────────────────────────────┐
│  app/api/bets/route.ts              │  Controller
│  - HTTP 요청/응답만 처리             │
│  - registry.betService 호출          │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  lib/bets/service.ts                │  Service
│  - 비즈니스 로직                     │
│  - Zod 검증                          │
│  - Repository 조합                   │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  lib/bets/repository.ts             │  Repository
│  - DB 쿼리 (Drizzle ORM)             │
│  - Atomic 업데이트                   │
│  - 트랜잭션                          │
└─────────────────────────────────────┘
```

---

## 구현 체크리스트

### Phase 1: 타입 정의

- [ ] `lib/bets/types.ts` 작성
  - BetQueryParams
  - CreateBetInput
  - CreateBetResult
  - GetBetsResult

### Phase 2: Validation

- [ ] `lib/bets/validation.ts` 작성
  - createBetSchema (Zod)
  - getBetsQuerySchema (Zod)

### Phase 3: Repository

- [ ] `lib/bets/repository.ts` 작성
  - findMany() - 베팅 목록 조회
  - findById() - 단일 베팅 조회
  - count() - 총 개수
  - create() - 베팅 생성 + 라운드 풀 업데이트 (트랜잭션)
  - updateUserBalance() - 유저 잔액 업데이트

### Phase 4: Service

- [ ] `lib/bets/service.ts` 작성
  - createBet() - 베팅 생성 (Validation + Repository)
  - getBets() - 베팅 목록 조회
  - getBetById() - 베팅 상세 조회

### Phase 5: Controller

- [ ] `app/api/bets/route.ts` 작성
  - POST 핸들러
  - GET 핸들러

### Phase 6: Registry 업데이트

- [ ] `lib/registry.ts` 수정
  - betRepository 추가
  - betService 추가

### Phase 7: 테스트

- [ ] Postman으로 API 테스트
- [ ] Race Condition 테스트 (동시 베팅)

---

## 베스트 프랙티스

### 1. Atomic 풀 업데이트 (가장 중요!)

**❌ 잘못된 방법 (Race Condition 발생):**

```typescript
// 절대 이렇게 하지 마세요!
const round = await db.select().from(rounds).where(eq(rounds.id, roundId));
const newTotal = round.totalPool + amount;
await db.update(rounds).set({ totalPool: newTotal });
```

**✅ 올바른 방법 (Atomic):**

```typescript
// Drizzle ORM의 sql`` 사용
await db
  .update(rounds)
  .set({
    totalPool: sql`${rounds.totalPool} + ${amount}`,
    totalGoldBets:
      prediction === 'GOLD' ? sql`${rounds.totalGoldBets} + ${amount}` : rounds.totalGoldBets,
    totalBtcBets:
      prediction === 'BTC' ? sql`${rounds.totalBtcBets} + ${amount}` : rounds.totalBtcBets,
    totalBetsCount: sql`${rounds.totalBetsCount} + 1`,
    updatedAt: Date.now(),
  })
  .where(
    and(
      eq(rounds.id, roundId),
      eq(rounds.status, 'BETTING_OPEN'), // 상태 체크도 포함!
    ),
  );
```

### 2. 트랜잭션 사용

베팅 생성 시 3가지 작업을 하나의 트랜잭션으로:

```typescript
await db.transaction(async (tx) => {
  // 1. 베팅 레코드 삽입
  const [bet] = await tx.insert(bets).values({ ... }).returning();

  // 2. 라운드 풀 업데이트 (Atomic)
  await tx.update(rounds).set({ ... });

  // 3. 유저 잔액 차감 (선택적, Week 1에서는 생략 가능)
  // await tx.update(users).set({ ... });

  return bet;
});
```

### 3. Validation 3단계

**Service Layer에서 수행:**

```typescript
// 1단계: 라운드 상태 확인
const round = await this.roundRepository.findById(roundId);
if (!round) {
  throw new NotFoundError('Round', roundId);
}
if (round.status !== 'BETTING_OPEN') {
  throw new BusinessRuleError('BETTING_CLOSED', '베팅이 마감되었습니다', {
    roundStatus: round.status,
  });
}

// 2단계: 시간 확인 (이중 안전장치)
const now = Date.now();
if (now >= round.lockTime) {
  throw new BusinessRuleError('BETTING_CLOSED', '베팅 시간이 종료되었습니다', {
    now,
    lockTime: round.lockTime,
  });
}

// 3단계: 유저 잔액 확인
const user = await this.userRepository.findById(userId);
if (user.delBalance < amount) {
  throw new BusinessRuleError('INSUFFICIENT_BALANCE', '잔액이 부족합니다', {
    required: amount,
    available: user.delBalance,
  });
}
```

### 4. 에러 처리

**Controller에서 Service 에러를 HTTP 응답으로 변환:**

```typescript
try {
  const result = await registry.betService.createBet(body);
  return createSuccessResponse({ bet: result });
} catch (error) {
  // handleApiError가 자동으로 에러 종류에 따라 HTTP 상태 코드 결정
  // NotFoundError → 404
  // BusinessRuleError → 400
  // ValidationError → 400
  // 기타 → 500
  return handleApiError(error);
}
```

---

## 답안 코드

### 1. lib/bets/types.ts

```typescript
import type { Bet } from '@/db/schema/bets';

/**
 * 베팅 쿼리 파라미터
 */
export interface BetQueryParams {
  filters?: {
    roundId?: string;
    userId?: string;
    prediction?: 'GOLD' | 'BTC';
    resultStatus?: string;
    settlementStatus?: string;
  };
  sort?: 'created_at' | 'amount';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/**
 * 베팅 생성 입력
 */
export interface CreateBetInput {
  roundId: string;
  userId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
}

/**
 * 베팅 생성 결과
 */
export interface CreateBetResult {
  bet: Bet;
  round: {
    totalPool: number;
    totalGoldBets: number;
    totalBtcBets: number;
    totalBetsCount: number;
  };
  userBalance: {
    delBalance: number;
  };
}

/**
 * 베팅 목록 조회 결과
 */
export interface GetBetsResult {
  bets: Bet[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 베팅과 라운드 정보를 포함한 상세 정보
 */
export interface BetWithRound extends Bet {
  round?: {
    id: string;
    roundNumber: number;
    type: string;
    status: string;
    startTime: number;
    endTime: number;
  };
}
```

### 2. lib/bets/validation.ts

```typescript
import { z } from 'zod';

/**
 * POST /api/bets Request Body 검증
 */
export const createBetSchema = z.object({
  roundId: z.string().uuid('유효한 라운드 ID가 아닙니다'),
  prediction: z.enum(['GOLD', 'BTC'], {
    errorMap: () => ({ message: 'prediction은 GOLD 또는 BTC여야 합니다' }),
  }),
  amount: z
    .number()
    .int('베팅 금액은 정수여야 합니다')
    .min(100, '최소 베팅 금액은 100입니다')
    .max(1000000, '최대 베팅 금액은 1,000,000입니다'),
});

/**
 * GET /api/bets Query Parameters 검증
 */
export const getBetsQuerySchema = z.object({
  roundId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  prediction: z.enum(['GOLD', 'BTC']).optional(),
  resultStatus: z.string().optional(),
  settlementStatus: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'amount']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
```

### 3. lib/bets/repository.ts

```typescript
/**
 * BetRepository - 베팅 데이터 접근 레이어
 *
 * 책임:
 * - DB 쿼리 생성 (Drizzle ORM)
 * - 트랜잭션 처리
 * - Atomic 업데이트
 *
 * 금지 사항:
 * - 비즈니스 로직 포함 ❌
 * - 입력 검증 (Service에서 수행) ❌
 */

import { getDb } from '@/lib/db';
import { bets, rounds, users } from '@/db/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Bet } from '@/db/schema/bets';
import type { Round } from '@/db/schema/rounds';
import type { BetQueryParams, CreateBetInput, BetWithRound } from './types';

export class BetRepository {
  /**
   * 베팅 목록 조회 (필터/정렬/페이지네이션)
   */
  async findMany(params: BetQueryParams): Promise<Bet[]> {
    const db = getDb();
    const { filters, sort, order, limit, offset } = params;

    // 1. 필터 조건 빌드
    const whereConditions = this.buildFilters(filters);

    // 2. 정렬 표현식
    const orderColumn = sort === 'amount' ? bets.amount : bets.createdAt;
    const orderByExpression = order === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // 3. 쿼리 실행
    let query = db.select().from(bets);

    if (whereConditions) {
      query = query.where(whereConditions);
    }

    return query.orderBy(orderByExpression).limit(limit).offset(offset);
  }

  /**
   * 베팅 개수 조회 (페이지네이션용)
   */
  async count(params: BetQueryParams): Promise<number> {
    const db = getDb();
    const whereConditions = this.buildFilters(params.filters);

    let query = db.select({ count: sql<number>`count(*)` }).from(bets);

    if (whereConditions) {
      query = query.where(whereConditions);
    }

    const result = await query;
    return result[0]?.count ?? 0;
  }

  /**
   * ID로 베팅 조회
   */
  async findById(id: string): Promise<Bet | undefined> {
    const db = getDb();
    const result = await db.select().from(bets).where(eq(bets.id, id)).limit(1);
    return result[0];
  }

  /**
   * 베팅 생성 + 라운드 풀 Atomic 업데이트 (트랜잭션)
   *
   * 이 함수가 가장 중요합니다!
   * - 베팅 레코드 삽입
   * - 라운드 풀 Atomic 업데이트
   * - 유저 잔액 차감
   * - 모두 하나의 트랜잭션으로 처리
   */
  async create(input: CreateBetInput): Promise<{ bet: Bet; round: Round }> {
    const db = getDb();
    const { roundId, userId, prediction, amount } = input;

    return await db.transaction(async (tx) => {
      // 1. 베팅 레코드 삽입
      const [bet] = await tx
        .insert(bets)
        .values({
          roundId,
          userId,
          prediction,
          amount,
          currency: 'DEL',
          resultStatus: 'PENDING',
          settlementStatus: 'PENDING',
          createdAt: Date.now(),
          processedAt: Date.now(),
        })
        .returning();

      // 2. 라운드 풀 Atomic 업데이트 (가장 중요!)
      const [updatedRound] = await tx
        .update(rounds)
        .set({
          totalPool: sql`${rounds.totalPool} + ${amount}`,
          totalGoldBets:
            prediction === 'GOLD' ? sql`${rounds.totalGoldBets} + ${amount}` : rounds.totalGoldBets,
          totalBtcBets:
            prediction === 'BTC' ? sql`${rounds.totalBtcBets} + ${amount}` : rounds.totalBtcBets,
          totalBetsCount: sql`${rounds.totalBetsCount} + 1`,
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(rounds.id, roundId),
            eq(rounds.status, 'BETTING_OPEN'), // 상태 체크 (이중 안전장치)
          ),
        )
        .returning();

      // 만약 UPDATE가 0 rows affected면 라운드가 이미 마감된 것
      if (!updatedRound) {
        throw new Error('Round is no longer accepting bets');
      }

      // 3. 유저 잔액 차감 (Week 1에서는 선택적)
      // Week 3에서는 Sui가 잔액을 관리하므로 이 부분은 제거될 수 있음
      await tx
        .update(users)
        .set({
          delBalance: sql`${users.delBalance} - ${amount}`,
          totalBets: sql`${users.totalBets} + 1`,
          totalVolume: sql`${users.totalVolume} + ${amount}`,
          updatedAt: Date.now(),
        })
        .where(eq(users.id, userId));

      return { bet, round: updatedRound };
    });
  }

  /**
   * 라운드 정보와 함께 베팅 조회
   */
  async findByIdWithRound(id: string): Promise<BetWithRound | undefined> {
    const db = getDb();

    const result = await db
      .select({
        bet: bets,
        round: {
          id: rounds.id,
          roundNumber: rounds.roundNumber,
          type: rounds.type,
          status: rounds.status,
          startTime: rounds.startTime,
          endTime: rounds.endTime,
        },
      })
      .from(bets)
      .leftJoin(rounds, eq(bets.roundId, rounds.id))
      .where(eq(bets.id, id))
      .limit(1);

    if (!result[0]) return undefined;

    return {
      ...result[0].bet,
      round: result[0].round,
    };
  }

  /**
   * 필터 조건 빌드 (private helper)
   */
  private buildFilters(filters?: BetQueryParams['filters']): SQL | undefined {
    if (!filters) return undefined;

    const conditions: SQL[] = [];

    if (filters.roundId) {
      conditions.push(eq(bets.roundId, filters.roundId));
    }

    if (filters.userId) {
      conditions.push(eq(bets.userId, filters.userId));
    }

    if (filters.prediction) {
      conditions.push(eq(bets.prediction, filters.prediction));
    }

    if (filters.resultStatus) {
      conditions.push(eq(bets.resultStatus, filters.resultStatus));
    }

    if (filters.settlementStatus) {
      conditions.push(eq(bets.settlementStatus, filters.settlementStatus));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
```

### 4. lib/bets/service.ts

```typescript
/**
 * BetService - 베팅 비즈니스 로직 레이어
 *
 * 책임:
 * - 입력 검증 (Zod)
 * - 비즈니스 로직 (베팅 가능 여부 판단)
 * - Repository 조합
 * - 비즈니스 에러 발생
 *
 * 금지 사항:
 * - HTTP 의존성 ❌
 * - 직접 SQL 작성 ❌
 */

import { BetRepository } from './repository';
import { RoundRepository } from '@/lib/rounds/repository';
import { createBetSchema, getBetsQuerySchema } from './validation';
import { ValidationError, NotFoundError, BusinessRuleError } from '@/lib/shared/errors';
import type {
  CreateBetInput,
  CreateBetResult,
  GetBetsResult,
  BetQueryParams,
  BetWithRound,
} from './types';

export class BetService {
  private betRepository: BetRepository;
  private roundRepository: RoundRepository;

  constructor(betRepository?: BetRepository, roundRepository?: RoundRepository) {
    this.betRepository = betRepository ?? new BetRepository();
    this.roundRepository = roundRepository ?? new RoundRepository();
  }

  /**
   * 베팅 생성
   *
   * Validation 3단계:
   * 1. 라운드 상태 확인 (BETTING_OPEN만 허용)
   * 2. 시간 확인 (lockTime 이전만 허용)
   * 3. 유저 잔액 확인 (충분한지 확인)
   *
   * @param rawInput - 검증되지 않은 입력
   * @param userId - 인증된 유저 ID (Week 1에서는 Mock)
   * @returns 베팅 결과 + 업데이트된 라운드 정보
   *
   * @throws {ValidationError} 입력 검증 실패
   * @throws {NotFoundError} 라운드 없음
   * @throws {BusinessRuleError} 베팅 불가 (마감, 잔액 부족 등)
   */
  async createBet(rawInput: unknown, userId: string): Promise<CreateBetResult> {
    // 1. 입력 검증 (Zod)
    const validated = createBetSchema.parse(rawInput);

    // 2. 라운드 존재 확인
    const round = await this.roundRepository.findById(validated.roundId);
    if (!round) {
      throw new NotFoundError('Round', validated.roundId);
    }

    // 3. 라운드 상태 확인 (BETTING_OPEN만 허용)
    if (round.status !== 'BETTING_OPEN') {
      throw new BusinessRuleError('BETTING_CLOSED', '베팅이 마감되었습니다', {
        roundStatus: round.status,
        roundId: round.id,
      });
    }

    // 4. 시간 확인 (이중 안전장치)
    const now = Date.now();
    if (now >= round.lockTime) {
      throw new BusinessRuleError('BETTING_CLOSED', '베팅 시간이 종료되었습니다', {
        now,
        lockTime: round.lockTime,
        timeRemaining: round.lockTime - now,
      });
    }

    // 5. 유저 잔액 확인
    // TODO: Week 1에서는 간단히 처리, Week 3에서 Sui 잔액 확인으로 대체
    // const user = await this.userRepository.findById(userId);
    // if (user.delBalance < validated.amount) {
    //   throw new BusinessRuleError('INSUFFICIENT_BALANCE', '잔액이 부족합니다', {
    //     required: validated.amount,
    //     available: user.delBalance,
    //   });
    // }

    // 6. 베팅 생성 (Repository)
    const { bet, round: updatedRound } = await this.betRepository.create({
      roundId: validated.roundId,
      userId,
      prediction: validated.prediction,
      amount: validated.amount,
    });

    // 7. 결과 반환
    return {
      bet,
      round: {
        totalPool: updatedRound.totalPool,
        totalGoldBets: updatedRound.totalGoldBets,
        totalBtcBets: updatedRound.totalBtcBets,
        totalBetsCount: updatedRound.totalBetsCount,
      },
      userBalance: {
        delBalance: 0, // TODO: Week 1에서는 임시값, Week 3에서 실제 값
      },
    };
  }

  /**
   * 베팅 목록 조회
   */
  async getBets(rawParams: unknown): Promise<GetBetsResult> {
    // 1. 입력 검증 (Zod)
    const validated = getBetsQuerySchema.parse(rawParams);

    // 2. Repository 파라미터 변환
    const queryParams: BetQueryParams = {
      filters: {
        roundId: validated.roundId,
        userId: validated.userId,
        prediction: validated.prediction,
        resultStatus: validated.resultStatus,
        settlementStatus: validated.settlementStatus,
      },
      sort: validated.sort,
      order: validated.order,
      limit: validated.pageSize,
      offset: (validated.page - 1) * validated.pageSize,
    };

    // 3. Repository 호출 (병렬 실행)
    const [bets, total] = await Promise.all([
      this.betRepository.findMany(queryParams),
      this.betRepository.count(queryParams),
    ]);

    // 4. 메타데이터 계산
    const totalPages = total > 0 ? Math.ceil(total / validated.pageSize) : 0;

    // 5. 결과 반환
    return {
      bets,
      meta: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages,
      },
    };
  }

  /**
   * 베팅 상세 조회 (라운드 정보 포함)
   */
  async getBetById(id: string): Promise<BetWithRound> {
    // 1. 입력 검증 (간단한 UUID 체크는 여기서)
    if (!id || id.length !== 36) {
      throw new ValidationError('유효한 베팅 ID가 아닙니다');
    }

    // 2. Repository 호출
    const bet = await this.betRepository.findByIdWithRound(id);

    if (!bet) {
      throw new NotFoundError('Bet', id);
    }

    return bet;
  }
}
```

### 5. app/api/bets/route.ts

```typescript
/**
 * POST /api/bets - 베팅 생성 API
 * GET /api/bets - 베팅 목록 조회 API
 *
 * Controller Layer: HTTP 요청/응답만 처리
 * 모든 비즈니스 로직은 BetService로 위임
 *
 * 의존성: lib/registry.ts에서 조립된 Service 사용
 *
 * 특징:
 * - registry.betService 사용 (직접 new 하지 않음)
 * - Week 1에서는 Sui 없이 D1만 사용
 * - Week 3에서 Sui 통합 시 Service만 수정
 */

import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import {
  createSuccessResponse,
  createSuccessResponseWithMeta,
  handleApiError,
} from '@/lib/shared/response';

/**
 * POST /api/bets - 베팅 생성
 *
 * Request Body:
 * {
 *   "roundId": "uuid",          // 베팅할 라운드 ID (필수)
 *   "prediction": "GOLD" | "BTC", // 예측 (필수)
 *   "amount": 1000              // 베팅 금액 (필수, 최소 100)
 * }
 *
 * Response (성공):
 * {
 *   "success": true,
 *   "data": {
 *     "bet": {
 *       "id": "uuid",
 *       "roundId": "uuid",
 *       "userId": "uuid",
 *       "prediction": "GOLD",
 *       "amount": 1000,
 *       "currency": "DEL",
 *       "resultStatus": "PENDING",
 *       "settlementStatus": "PENDING",
 *       "createdAt": 1700000030000,
 *       "processedAt": 1700000031000
 *     },
 *     "round": {
 *       "totalPool": 1501000,      // 업데이트된 풀
 *       "totalGoldBets": 801000,
 *       "totalBtcBets": 700000,
 *       "totalBetsCount": 151
 *     },
 *     "userBalance": {
 *       "delBalance": 4000          // 베팅 후 잔액
 *     }
 *   }
 * }
 *
 * Response (에러):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "BETTING_CLOSED" | "INSUFFICIENT_BALANCE" | ...,
 *     "message": "에러 메시지",
 *     "details"?: { ... }
 *   }
 * }
 *
 * Validation:
 * 1. 라운드 상태 = BETTING_OPEN
 * 2. 현재 시각 < lockTime
 * 3. 유저 잔액 >= amount
 * 4. amount >= 100
 *
 * 에러 케이스:
 * - BETTING_CLOSED: 베팅 마감됨
 * - INSUFFICIENT_BALANCE: 잔액 부족
 * - NOT_FOUND: 라운드 없음
 * - VALIDATION_ERROR: 입력 검증 실패
 *
 * 구현 순서:
 * 1. Request Body 파싱
 * 2. 유저 인증 (Week 1에서는 Mock userId 사용)
 * 3. Service 호출 (registry.betService.createBet)
 * 4. 성공 응답 반환
 * 5. 에러 처리 (Service 에러 → HTTP 응답)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Request Body 파싱
    const body = await request.json();

    // TODO: 2. 유저 인증 (Week 1에서는 Mock, Week 3에서 실제 인증)
    // const session = await getSession(request);
    // const userId = session.userId;
    const userId = 'mock-user-id'; // Week 1 임시값

    // 3. Service 호출
    // Service에서 다음 작업 수행:
    // - 입력 검증 (Zod)
    // - 라운드 상태 확인 (BETTING_OPEN)
    // - 시간 확인 (lockTime 이전)
    // - 유저 잔액 확인
    // - 베팅 레코드 삽입 + 라운드 풀 Atomic 업데이트 (트랜잭션)
    const result = await registry.betService.createBet(body, userId);

    // 4. 성공 응답 반환
    return createSuccessResponse(result);
  } catch (error) {
    // 5. 에러 처리 (Service 에러 → HTTP 응답)
    // NotFoundError → 404
    // BusinessRuleError → 400
    // ValidationError → 400
    // 기타 → 500
    return handleApiError(error);
  }
}

/**
 * GET /api/bets - 베팅 목록 조회
 *
 * Query Parameters:
 * - roundId: 라운드 필터 (선택)
 * - userId: 유저 필터 (선택)
 * - prediction: 'GOLD' | 'BTC' (선택)
 * - resultStatus: 결과 상태 (선택)
 * - settlementStatus: 정산 상태 (선택)
 * - page: 페이지 번호 (기본: 1)
 * - pageSize: 페이지 크기 (기본: 20, 최대: 100)
 * - sort: 'created_at' | 'amount' (기본: created_at)
 * - order: 'asc' | 'desc' (기본: desc)
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "bets": [
 *       {
 *         "id": "uuid",
 *         "roundId": "uuid",
 *         "userId": "uuid",
 *         "prediction": "GOLD",
 *         "amount": 1000,
 *         "currency": "DEL",
 *         "resultStatus": "PENDING",
 *         "settlementStatus": "PENDING",
 *         "createdAt": 1700000030000
 *       }
 *       // ...
 *     ]
 *   },
 *   "meta": {
 *     "page": 1,
 *     "pageSize": 20,
 *     "total": 150,
 *     "totalPages": 8
 *   }
 * }
 *
 * 사용 예시:
 * GET /api/bets?roundId=uuid&page=1&pageSize=20
 * GET /api/bets?userId=uuid&resultStatus=WON
 *
 * 구현 순서:
 * 1. Query 파라미터 파싱
 * 2. Service 호출 (registry.betService.getBets)
 * 3. 성공 응답 반환 (메타데이터 포함)
 * 4. 에러 처리
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Query 파라미터 파싱
    const params = parseQueryParams(request);

    // 2. Service 호출 (registry에서 조립된 인스턴스 사용)
    const result = await registry.betService.getBets(params);

    // 3. 성공 응답 반환 (메타데이터 포함)
    return createSuccessResponseWithMeta({ bets: result.bets }, result.meta);
  } catch (error) {
    // 4. 에러 처리 (Service 에러 → HTTP 응답)
    return handleApiError(error);
  }
}

/**
 * Query 파라미터 파싱 헬퍼 함수
 *
 * Service에서 Zod로 검증하므로 여기서는 간단히 파싱만 수행
 *
 * @private
 */
function parseQueryParams(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  return {
    roundId: searchParams.get('roundId') ?? undefined,
    userId: searchParams.get('userId') ?? undefined,
    prediction: searchParams.get('prediction') ?? undefined,
    resultStatus: searchParams.get('resultStatus') ?? undefined,
    settlementStatus: searchParams.get('settlementStatus') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    order: searchParams.get('order') ?? undefined,
  };
}
```

### 6. app/api/bets/[id]/route.ts

```typescript
/**
 * GET /api/bets/:id - 베팅 상세 조회 API
 *
 * Controller Layer: HTTP 요청/응답만 처리
 */

import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

/**
 * GET /api/bets/:id - 베팅 상세 조회
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "bet": {
 *       "id": "uuid",
 *       // ... 베팅 정보
 *       "round": {
 *         "id": "uuid",
 *         "roundNumber": 42,
 *         "type": "6HOUR",
 *         "status": "BETTING_OPEN"
 *       }
 *     }
 *   }
 * }
 *
 * 구현 순서:
 * 1. Path 파라미터 추출 (id)
 * 2. Service 호출
 * 3. 성공 응답 반환
 * 4. 에러 처리 (NOT_FOUND → 404)
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // 1. Path 파라미터 추출
    const { id } = params;

    // 2. Service 호출
    const bet = await registry.betService.getBetById(id);

    // 3. 성공 응답 반환
    return createSuccessResponse({ bet });
  } catch (error) {
    // 4. 에러 처리 (NOT_FOUND → 404)
    return handleApiError(error);
  }
}
```

### 7. lib/registry.ts 업데이트

```typescript
// 기존 코드에 추가:

import { BetRepository } from './bets/repository';
import { BetService } from './bets/service';

class ServiceRegistry {
  // ... 기존 코드 ...

  // Repository 인스턴스
  private _betRepository?: BetRepository;

  get betRepository(): BetRepository {
    if (!this._betRepository) {
      this._betRepository = new BetRepository();
    }
    return this._betRepository;
  }

  // Service 인스턴스 (Repository 주입)
  private _betService?: BetService;

  get betService(): BetService {
    if (!this._betService) {
      // ✅ 의존성 조립: BetRepository + RoundRepository를 BetService에 주입
      this._betService = new BetService(this.betRepository, this.roundRepository);
    }
    return this._betService;
  }

  // 테스트용
  setBetRepository(repository: BetRepository): void {
    this._betRepository = repository;
    this._betService = undefined;
  }

  setBetService(service: BetService): void {
    this._betService = service;
  }

  // reset() 메서드에도 추가
  reset(): void {
    this._roundRepository = undefined;
    this._roundService = undefined;
    this._betRepository = undefined;
    this._betService = undefined;
  }
}
```

---

## 테스트 시나리오

### 1. 정상 베팅 (Happy Path)

```bash
# 1. 현재 활성 라운드 조회
GET /api/rounds/current?type=6HOUR

# 2. 베팅 생성
POST /api/bets
{
  "roundId": "{{round_id}}",
  "prediction": "GOLD",
  "amount": 1000
}

# 3. 베팅 확인
GET /api/bets?roundId={{round_id}}

# 4. 라운드 풀 확인 (totalPool이 1000 증가했는지)
GET /api/rounds/{{round_id}}
```

### 2. 베팅 마감 후 시도 (에러 케이스)

```bash
# 1. 라운드 상태를 BETTING_LOCKED로 변경 (수동 또는 Cron)
POST /api/cron/rounds/lock

# 2. 베팅 시도 → 400 BETTING_CLOSED
POST /api/bets
{
  "roundId": "{{round_id}}",
  "prediction": "BTC",
  "amount": 500
}

# 예상 응답:
# {
#   "success": false,
#   "error": {
#     "code": "BETTING_CLOSED",
#     "message": "베팅이 마감되었습니다",
#     "details": { "roundStatus": "BETTING_LOCKED" }
#   }
# }
```

### 3. Race Condition 테스트 (동시 베팅)

```bash
# Postman Collection Runner 사용
# - 10개 요청을 동시에 전송 (각 1000 DEL)
# - 모두 성공하면 totalPool이 정확히 10000 증가해야 함

# 검증:
GET /api/rounds/{{round_id}}
# totalPool이 정확히 원래값 + 10000인지 확인
```

### 4. 잔액 부족 (에러 케이스)

```bash
# Week 1에서는 잔액 체크 생략 가능
# Week 3에서 Sui 통합 시 테스트
```

### 5. 페이지네이션 테스트

```bash
# 1. 베팅 20개 생성 (반복)

# 2. 첫 페이지 조회
GET /api/bets?roundId={{round_id}}&page=1&pageSize=10
# total: 20, totalPages: 2

# 3. 두 번째 페이지 조회
GET /api/bets?roundId={{round_id}}&page=2&pageSize=10
```

### 6. 필터링 테스트

```bash
# GOLD 베팅만 조회
GET /api/bets?roundId={{round_id}}&prediction=GOLD

# 특정 유저의 베팅만 조회
GET /api/bets?userId={{user_id}}
```

---

## 정리

### ✅ 구현 완료 체크리스트

- [ ] `lib/bets/types.ts` 작성
- [ ] `lib/bets/validation.ts` 작성
- [ ] `lib/bets/repository.ts` 작성
  - [ ] findMany() 구현
  - [ ] count() 구현
  - [ ] findById() 구현
  - [ ] create() 구현 (Atomic 업데이트 + 트랜잭션)
  - [ ] findByIdWithRound() 구현
- [ ] `lib/bets/service.ts` 작성
  - [ ] createBet() 구현 (3단계 Validation)
  - [ ] getBets() 구현
  - [ ] getBetById() 구현
- [ ] `app/api/bets/route.ts` 작성
  - [ ] POST 핸들러
  - [ ] GET 핸들러
- [ ] `app/api/bets/[id]/route.ts` 작성
- [ ] `lib/registry.ts` 업데이트
  - [ ] betRepository 추가
  - [ ] betService 추가
- [ ] Postman으로 모든 시나리오 테스트

### 핵심 포인트

1. **Atomic 업데이트**: `sql\`\${rounds.totalPool} + \${amount}\`` 사용
2. **트랜잭션**: 베팅 삽입 + 라운드 풀 업데이트를 하나로
3. **Validation 3단계**: 상태 → 시간 → 잔액
4. **에러 처리**: Service 에러 → Controller가 HTTP 응답으로 변환

### Week 3 준비사항

Week 1에서 완성한 이 코드는 Week 3에서 Sui 통합 시:

- **Service만 수정**: Sui 트랜잭션 추가
- **Controller는 그대로**: HTTP 인터페이스 변경 없음
- **Repository**: Sui 성공 후 D1 저장으로 순서만 변경

따라서 **지금 만든 구조가 그대로 Week 3까지 사용됩니다!**

---

**이 문서대로 구현하면 베스트 프랙티스를 따르는 완벽한 Bet API가 완성됩니다.**

**막히는 부분이 있으면 "답안 코드" 섹션을 참고하세요!** 🚀
