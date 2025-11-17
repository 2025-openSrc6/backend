# Architecture Guide

deltaX 프로젝트의 API 아키텍처 베스트 프랙티스

---

## 📋 목차

1. [전체 구조 개요](#전체-구조-개요)
2. [의존성 주입 (DI) 및 Registry](#의존성-주입-di-및-registry)
3. [Layer별 책임](#layer별-책임)
4. [파일 구조](#파일-구조)
5. [코딩 컨벤션](#코딩-컨벤션)
6. [에러 처리](#에러-처리)
7. [테스트 전략](#테스트-전략)

---

## 전체 구조 개요

### 3-Layer Architecture

```
┌─────────────────────────────────────┐
│  Controller Layer (API Routes)      │  ← HTTP 요청/응답 처리
│  app/api/*/route.ts                 │     - Request parsing
└──────────────┬──────────────────────┘     - Response formatting
               │                             - Error handling (HTTP)
┌──────────────▼──────────────────────┐
│  Service Layer                       │  ← 비즈니스 로직
│  lib/*/service.ts                    │     - Input validation
└──────────────┬──────────────────────┘     - Business rules
               │                             - Data transformation
┌──────────────▼──────────────────────┐
│  Repository Layer                    │  ← 데이터 접근
│  lib/*/repository.ts                 │     - DB queries
└─────────────────────────────────────┘     - Query builders
```

### 핵심 원칙

1. **Separation of Concerns** (관심사의 분리)
   - 각 레이어는 하나의 책임만 가짐
   - 상위 레이어만 하위 레이어 호출 가능

2. **Single Source of Truth**
   - 비즈니스 로직은 Service Layer에만
   - DB 쿼리는 Repository Layer에만

3. **Reusability** (재사용성)
   - Service는 API Route, Server Action 모두에서 호출 가능
   - Repository는 여러 Service에서 재사용

4. **Testability** (테스트 용이성)
   - 각 레이어를 독립적으로 테스트 가능
   - Mock 주입 용이

---

## 의존성 주입 (DI) 및 조립 파일

### 문제: 의존성을 어디서 조립할 것인가?

**이전 접근 방식의 문제점**:
```typescript
// ❌ 문제: Controller에서 직접 조립
export async function GET(request: NextRequest) {
  const repo = new RoundRepository();
  const service = new RoundService(repo);  // 매번 생성
  return await service.getRounds(params);
}

// ❌ 문제: Service에서 자체 조립
class RoundService {
  constructor(repository?: RoundRepository) {
    this.repository = repository ?? new RoundRepository();  // DI 원칙 위반
  }
}
```

**문제점**:
1. Controller가 의존성 조립까지 책임짐 (역할 과다)
2. 매 요청마다 인스턴스 재생성 (성능 낭비)
3. Service가 자체적으로 의존성 생성 (테스트 어려움)
4. 의존성 조립 로직이 여러 곳에 분산

---

### 해결책: 중앙 조립 파일 (`lib/registry.ts`)

**`lib/registry.ts` - 의존성을 한 곳에서 조립**

```typescript
/**
 * 의존성 조립 파일
 *
 * Service/Repository를 어떻게 조립할지 한 곳에서 정의합니다.
 * "new RoundService(뭐넣지?)" → 여기서 결정
 */
class ServiceRegistry {
  private _roundRepository?: RoundRepository;
  private _roundService?: RoundService;

  // Repository 인스턴스 (필요시 생성)
  get roundRepository(): RoundRepository {
    if (!this._roundRepository) {
      this._roundRepository = new RoundRepository();
    }
    return this._roundRepository;
  }

  // Service 인스턴스 (Repository 주입)
  get roundService(): RoundService {
    if (!this._roundService) {
      // ✅ 여기서 의존성 조립: Repository를 Service에 넣어줌
      this._roundService = new RoundService(this.roundRepository);
    }
    return this._roundService;
  }

  // 테스트용: Mock으로 교체
  setRoundService(service: RoundService): void {
    this._roundService = service;
  }

  // 테스트용: 초기화
  reset(): void {
    this._roundRepository = undefined;
    this._roundService = undefined;
  }
}

// 전역에서 하나만 사용 (인스턴스 재사용)
export const registry = new ServiceRegistry();
```

---

### 사용법

#### 1. Controller에서 사용

```typescript
// app/api/rounds/route.ts
import { registry } from '@/lib/registry';

export async function GET(request: NextRequest) {
  try {
    // ✅ 조립된 Service 사용 (의존성은 registry가 알아서 넣어줌)
    const result = await registry.roundService.getRounds(params);
    return createSuccessResponseWithMeta({ rounds: result.rounds }, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}
```

**장점**:
- ✅ Controller는 의존성 조립을 신경 쓰지 않음
- ✅ 인스턴스 재사용으로 성능 향상
- ✅ 의존성 변경 시 registry.ts만 수정
- ✅ 코드 간결

#### 2. Server Action에서 사용

```typescript
// app/actions/rounds.ts
'use server';

import { registry } from '@/lib/registry';

export async function getRoundsAction(params: unknown) {
  return registry.roundService.getRounds(params);
}
```

**장점**:
- ✅ 동일한 조립 파일 사용
- ✅ 중복 없음

#### 3. 테스트에서 Mock 교체

```typescript
// lib/rounds/service.test.ts
import { registry } from '@/lib/registry';
import { RoundService } from './service';

describe('RoundService', () => {
  let mockService: jest.Mocked<RoundService>;

  beforeEach(() => {
    mockService = {
      getRounds: jest.fn(),
    } as any;

    // ✅ 실제 Service 대신 Mock 사용하도록 교체
    registry.setRoundService(mockService);
  });

  afterEach(() => {
    // ✅ 테스트 후 원래대로 복구
    registry.reset();
  });

  it('should call service', async () => {
    mockService.getRounds.mockResolvedValue({ rounds: [], meta: {} });
    const result = await registry.roundService.getRounds({});
    expect(mockService.getRounds).toHaveBeenCalledTimes(1);
  });
});
```

---

### 조립 파일의 이점

#### 1. 의존성 조립을 한 곳에서

**Before (조립 로직이 분산)**:
```typescript
// Controller A
const service = new RoundService(new RoundRepository());

// Controller B
const service = new RoundService(new RoundRepository());

// 문제: 의존성 변경 시 모든 곳 수정
```

**After (조립 파일에서 일괄 관리)**:
```typescript
// lib/registry.ts (한 곳에서만 정의)
get roundService(): RoundService {
  return new RoundService(this.roundRepository);
}

// Controller들은 그냥 사용
const result = await registry.roundService.getRounds(params);
```

**이점**:
- 의존성 변경 시 registry.ts만 수정
- 조립 로직 중복 제거

#### 2. 인스턴스 재사용 (성능)

```typescript
// 첫 호출: 생성
const service1 = registry.roundService;  // new RoundService(...)

// 이후 호출: 재사용
const service2 = registry.roundService;  // 같은 인스턴스
```

#### 3. 확장 용이

```typescript
// lib/registry.ts - 새 Service 추가 시
class ServiceRegistry {
  // Rounds (기존)
  get roundService(): RoundService { ... }

  // Bets (추가)
  get betService(): BetService {
    return new BetService(this.betRepository);
  }
}
```

---

### 주의사항

#### 1. Service는 상태를 가지지 않음

인스턴스를 재사용하므로 요청별 데이터를 인스턴스 변수에 저장하면 안 됩니다:

```typescript
// ❌ 나쁜 예
class RoundService {
  private currentUser?: User;  // ❌ 모든 요청이 공유

  async getRounds(params: unknown) {
    this.currentUser = getCurrentUser();  // ❌ 요청 A가 요청 B에 영향
  }
}

// ✅ 좋은 예
class RoundService {
  async getRounds(params: unknown, userId?: string) {
    const user = userId ? await getUserById(userId) : null;  // 파라미터로 전달
  }
}
```

#### 2. 의존성 변경 시 조립 파일만 수정

```typescript
// lib/registry.ts
get roundService(): RoundService {
  // ✅ 여기만 수정하면 모든 곳에 반영
  return new RoundService(
    this.roundRepository,
    this.priceService,  // 새 의존성 추가
  );
}
```

---

## Layer별 책임

### Controller Layer (API Routes)

**위치**: `app/api/*/route.ts`

**책임**:
- ✅ HTTP 요청 파싱 (query params, body, headers)
- ✅ Service Layer 호출
- ✅ HTTP 응답 생성 (status code, headers, body)
- ✅ HTTP 에러 변환 (ServiceError → HTTP Response)

**금지 사항**:
- ❌ 비즈니스 로직 포함
- ❌ 직접 DB 접근
- ❌ 복잡한 데이터 변환

**예시**:
```typescript
export async function GET(request: NextRequest) {
  try {
    // 1. 요청 파싱
    const params = parseQueryParams(request);

    // 2. Service 호출
    const result = await roundService.getRounds(params);

    // 3. 응답 생성
    return createSuccessResponse(result);
  } catch (error) {
    // 4. 에러 변환
    return handleApiError(error);
  }
}
```

---

### Service Layer

**위치**: `lib/*/service.ts`

**책임**:
- ✅ 입력 검증 (Zod schema)
- ✅ 비즈니스 로직 (계산, 판단, 변환)
- ✅ Repository 조합 (여러 Repository 호출)
- ✅ 트랜잭션 관리
- ✅ 비즈니스 에러 발생

**금지 사항**:
- ❌ HTTP 의존성 (NextRequest, NextResponse)
- ❌ 직접 SQL 작성
- ❌ 프레임워크 종속적인 코드

**예시**:
```typescript
export class RoundService {
  constructor(
    private roundRepo: RoundRepository,
    private priceService: PriceService,
  ) {}

  async getRounds(params: GetRoundsParams): Promise<GetRoundsResult> {
    // 1. 입력 검증
    const validated = getRoundsSchema.parse(params);

    // 2. Repository 호출
    const rounds = await this.roundRepo.findMany(validated);
    const total = await this.roundRepo.count(validated);

    // 3. 비즈니스 로직 (필요시)
    const enrichedRounds = rounds.map(round => ({
      ...round,
      canBet: this.canBetOnRound(round),
    }));

    // 4. 결과 반환
    return {
      rounds: enrichedRounds,
      meta: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages: Math.ceil(total / validated.pageSize),
      },
    };
  }

  private canBetOnRound(round: Round): boolean {
    return round.status === 'BETTING_OPEN' &&
           Date.now() < round.lockTime * 1000;
  }
}
```

---

### Repository Layer

**위치**: `lib/*/repository.ts`

**책임**:
- ✅ DB 쿼리 생성 (Drizzle ORM)
- ✅ 필터/정렬/페이지네이션 로직
- ✅ Raw 데이터 반환
- ✅ DB 에러 처리

**금지 사항**:
- ❌ 비즈니스 로직
- ❌ 입력 검증 (Service에서 수행)
- ❌ 데이터 변환 (Service에서 수행)

**예시**:
```typescript
export class RoundRepository {
  constructor(private db: DrizzleDB) {}

  async findMany(params: RoundQueryParams): Promise<Round[]> {
    const { filters, sort, limit, offset } = params;

    let query = this.db.select().from(rounds);

    if (filters.type) {
      query = query.where(eq(rounds.type, filters.type));
    }

    if (filters.statuses && filters.statuses.length > 0) {
      query = query.where(inArray(rounds.status, filters.statuses));
    }

    return query
      .orderBy(sort === 'asc' ? asc(rounds.startTime) : desc(rounds.startTime))
      .limit(limit)
      .offset(offset);
  }

  async count(params: RoundQueryParams): Promise<number> {
    // Similar filter logic
  }
}
```

---

## 파일 구조

```
deltax/
├── app/
│   └── api/
│       ├── rounds/
│       │   ├── route.ts              # GET /api/rounds
│       │   ├── current/
│       │   │   └── route.ts          # GET /api/rounds/current
│       │   └── [id]/
│       │       └── route.ts          # GET /api/rounds/:id
│       ├── bets/
│       │   ├── route.ts
│       │   └── [id]/
│       │       └── route.ts
│       └── users/
│           └── ...
│
├── lib/
│   ├── registry.ts                   # ⭐ 의존성 조립 파일
│   │
│   ├── rounds/
│   │   ├── types.ts                  # 타입 정의
│   │   ├── constants.ts              # 상수
│   │   ├── validation.ts             # Zod schemas
│   │   ├── service.ts                # RoundService
│   │   └── repository.ts             # RoundRepository
│   │
│   ├── bets/
│   │   ├── types.ts
│   │   ├── service.ts
│   │   └── repository.ts
│   │
│   ├── shared/
│   │   ├── errors.ts                 # Custom error classes
│   │   ├── response.ts               # Response helpers
│   │   ├── pagination.ts             # Pagination utilities
│   │   └── validation.ts             # Common validators
│   │
│   └── db/
│       ├── index.ts                  # getDb()
│       └── schema.ts                 # Drizzle schema
│
└── docs/
    └── ehdnd/
        ├── API_SPECIFICATION.md
        ├── IMPLEMENTATION_ROADMAP.md
        └── ARCHITECTURE_GUIDE.md      # 이 문서
```

---

## 코딩 컨벤션

### 1. 파일 네이밍

- **types.ts**: 도메인 타입 정의
- **constants.ts**: 상수 (ROUND_TYPES, STATUSES 등)
- **validation.ts**: Zod schemas
- **service.ts**: Service class
- **repository.ts**: Repository class
- **route.ts**: API route handler

### 2. 함수 네이밍

**Service Layer**:
- `getRounds()`, `getRoundById()`, `createRound()`
- `updateRound()`, `deleteRound()`
- Prefix: get, create, update, delete, calculate, validate

**Repository Layer**:
- `findMany()`, `findById()`, `findOne()`
- `insert()`, `update()`, `delete()`
- `count()`, `exists()`
- Prefix: find, insert, update, delete, count, exists

**Controller Layer**:
- HTTP method 함수: `GET()`, `POST()`, `PATCH()`, `DELETE()`
- Helper: `parseQueryParams()`, `createSuccessResponse()`

### 3. 에러 네이밍

```typescript
// lib/shared/errors.ts
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class NotFoundError extends ServiceError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} not found: ${id}`);
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, details);
  }
}

export class BusinessRuleError extends ServiceError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, details);
  }
}
```

---

## 에러 처리

### Service Layer에서 에러 발생

```typescript
// lib/rounds/service.ts
async getRoundById(id: string): Promise<Round> {
  const round = await this.roundRepo.findById(id);

  if (!round) {
    throw new NotFoundError('Round', id);
  }

  return round;
}

async createBet(params: CreateBetParams): Promise<Bet> {
  // 비즈니스 룰 검증
  if (round.status !== 'BETTING_OPEN') {
    throw new BusinessRuleError(
      'BETTING_CLOSED',
      '베팅이 마감되었습니다',
      { roundStatus: round.status }
    );
  }

  // ...
}
```

### Controller Layer에서 에러 처리

```typescript
// lib/shared/response.ts
export function handleApiError(error: unknown): NextResponse {
  console.error('API Error:', error);

  if (error instanceof NotFoundError) {
    return createErrorResponse(404, error.code, error.message);
  }

  if (error instanceof ValidationError) {
    return createErrorResponse(400, error.code, error.message, error.details);
  }

  if (error instanceof BusinessRuleError) {
    return createErrorResponse(400, error.code, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return createErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input', error.errors);
  }

  // Unknown error
  return createErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
}
```

---

## 테스트 전략

### 1. Repository Layer 테스트

```typescript
// lib/rounds/repository.test.ts
describe('RoundRepository', () => {
  let db: DrizzleDB;
  let repo: RoundRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new RoundRepository(db);
  });

  it('should find rounds by type', async () => {
    await seedRounds(db);

    const result = await repo.findMany({
      filters: { type: '6HOUR' },
      limit: 10,
      offset: 0,
    });

    expect(result).toHaveLength(5);
    expect(result[0].type).toBe('6HOUR');
  });
});
```

### 2. Service Layer 테스트 (Mock Repository)

```typescript
// lib/rounds/service.test.ts
describe('RoundService', () => {
  let mockRepo: jest.Mocked<RoundRepository>;
  let service: RoundService;

  beforeEach(() => {
    mockRepo = {
      findMany: jest.fn(),
      count: jest.fn(),
    } as any;

    service = new RoundService(mockRepo);
  });

  it('should return rounds with pagination', async () => {
    mockRepo.findMany.mockResolvedValue([/* mock data */]);
    mockRepo.count.mockResolvedValue(100);

    const result = await service.getRounds({
      page: 1,
      pageSize: 20,
    });

    expect(result.rounds).toHaveLength(20);
    expect(result.meta.total).toBe(100);
  });

  it('should throw ValidationError for invalid page', async () => {
    await expect(
      service.getRounds({ page: 0, pageSize: 20 })
    ).rejects.toThrow(ValidationError);
  });
});
```

### 3. Controller Layer 테스트 (Integration)

```typescript
// app/api/rounds/route.test.ts
describe('GET /api/rounds', () => {
  it('should return 200 with rounds', async () => {
    const request = new NextRequest('http://localhost/api/rounds?page=1');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.rounds).toBeDefined();
  });

  it('should return 400 for invalid page', async () => {
    const request = new NextRequest('http://localhost/api/rounds?page=-1');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

---

## 확장 계획

### Phase 1: 현재 (Week 1)
- ✅ Rounds API (GET /api/rounds)
- 🔜 Rounds API (GET /api/rounds/current)
- 🔜 Rounds API (GET /api/rounds/:id)

### Phase 2: Week 2-3
- Bets API (동일한 패턴 적용)
- Users API (도영)
- Points API (도영)

### Phase 3: Week 4
- Settlement logic
- Cron jobs
- WebSocket events

### 재사용 가능한 패턴
1. **Pagination**: `lib/shared/pagination.ts`
2. **Filtering**: `lib/shared/filtering.ts`
3. **Sorting**: `lib/shared/sorting.ts`
4. **Response formatting**: `lib/shared/response.ts`
5. **Error handling**: `lib/shared/errors.ts`

---

## 요약

### ✅ DO
- Controller는 HTTP만, Service는 비즈니스만, Repository는 DB만
- Zod로 입력 검증
- Custom Error class 사용
- 각 레이어를 독립적으로 테스트
- 공통 유틸리티 재사용

### ❌ DON'T
- Controller에 비즈니스 로직 작성
- Service에서 직접 SQL 작성
- Repository에 검증 로직 포함
- 레이어 건너뛰기 (Controller → Repository 직접 호출)
- 하드코딩된 상수 (constants.ts 사용)

---

이 가이드를 베이스로 모든 API를 구현하세요.
팀원들과 공유하고 일관된 패턴을 유지하는 것이 중요합니다.
