# 실용적 아키텍처 가이드

**목적**: ARCHITECTURE_GUIDE.md의 실전 적용 버전
**대상**: deltaX 같은 중간 규모 프로젝트

---

## 핵심 원칙: "필요한 만큼만"

### ✅ 반드시 적용
1. **Controller-Service 분리** (필수)
2. **입력 검증** (Zod)
3. **에러 처리** (Custom Error Classes)

### ⚠️ 선택적 적용
1. **Repository Layer** → 복잡한 쿼리만
2. **테스트** → 중요한 로직만
3. **문서화** → 복잡한 부분만

---

## Repository 사용 기준

### ✅ Repository로 분리하는 경우

```typescript
// lib/rounds/repository.ts

// 1. 쿼리가 10줄 이상
async findMany(params: RoundQueryParams): Promise<Round[]> {
  // 동적 필터링 (3줄)
  // WHERE 조건 빌드 (5줄)
  // 정렬 로직 (2줄)
  // 페이지네이션 (2줄)
  // → 총 12줄: Repository로!
}

// 2. 같은 로직을 2곳 이상에서 사용
async getActiveRounds(): Promise<Round[]> {
  // BetService, SettlementService 모두 사용
  // → 재사용 위해 Repository로!
}

// 3. 복잡한 JOIN이나 집계
async getRoundStats(roundId: string): Promise<RoundStats> {
  // JOIN bets, SUM, GROUP BY
  // → 복잡하니까 Repository로!
}
```

### ❌ Service에 직접 작성하는 경우

```typescript
// lib/rounds/service.ts

// 1. 단순 조회 (1-5줄)
async getRoundById(id: string): Promise<Round> {
  const db = getDb();
  const result = await db.select().from(rounds).where(eq(rounds.id, id));
  if (!result[0]) throw new NotFoundError('Round', id);
  return result[0];
}

// 2. 단순 삽입
async createRound(data: InsertRound): Promise<Round> {
  const db = getDb();
  const result = await db.insert(rounds).values(data).returning();
  return result[0];
}

// 3. 한 곳에서만 사용하는 간단한 쿼리
async getCurrentRound(): Promise<Round | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(rounds)
    .where(eq(rounds.status, 'BETTING_OPEN'))
    .limit(1);
  return result[0] ?? null;
}
```

---

## 레이어별 체크리스트

### Controller Layer (app/api/*/route.ts)

```typescript
export async function GET(request: NextRequest) {
  try {
    // ✅ 1. 요청 파싱
    const params = parseQueryParams(request);

    // ✅ 2. Service 호출 (비즈니스 로직 위임)
    const result = await registry.roundService.getRounds(params);

    // ✅ 3. 응답 생성
    return createSuccessResponse(result);
  } catch (error) {
    // ✅ 4. 에러 변환 (ServiceError → HTTP Response)
    return handleApiError(error);
  }
}

// ❌ Controller에서 하지 말 것:
// - Zod 검증 (Service에서)
// - 비즈니스 로직 (Service에서)
// - 직접 DB 접근 (Service/Repository에서)
```

### Service Layer (lib/*/service.ts)

```typescript
export class RoundService {
  // ✅ 간단한 쿼리: 직접 작성
  async getRoundById(id: string): Promise<Round> {
    // 1. 입력 검증
    if (!this.isValidUuid(id)) {
      throw new ValidationError('Invalid UUID');
    }

    // 2. DB 조회 (직접)
    const db = getDb();
    const result = await db.select().from(rounds).where(eq(rounds.id, id));

    // 3. 비즈니스 로직
    if (!result[0]) {
      throw new NotFoundError('Round', id);
    }

    return result[0];
  }

  // ✅ 복잡한 쿼리: Repository 사용
  async getRounds(params: unknown): Promise<GetRoundsResult> {
    // 1. 입력 검증 (Zod)
    const validated = getRoundsQuerySchema.parse(params);

    // 2. Repository 호출
    const [rounds, total] = await Promise.all([
      this.repository.findMany(validated),
      this.repository.count(validated),
    ]);

    // 3. 비즈니스 로직 (메타데이터 계산)
    const totalPages = Math.ceil(total / validated.pageSize);

    return { rounds, meta: { page, pageSize, total, totalPages } };
  }
}
```

### Repository Layer (lib/*/repository.ts) - 선택적

```typescript
export class RoundRepository {
  // ✅ 복잡한 쿼리만 포함

  // 동적 필터링 + 정렬 + 페이지네이션
  async findMany(params: RoundQueryParams): Promise<Round[]> {
    const db = getDb();
    const { filters, sort, order, limit, offset } = params;

    // 복잡한 WHERE 조건 빌드
    const whereConditions = this.buildFilters(filters);

    // 동적 ORDER BY
    const orderByExpression = this.buildOrderBy(sort, order);

    let query = db.select().from(rounds);
    if (whereConditions) query = query.where(whereConditions);

    return query.orderBy(orderByExpression).limit(limit).offset(offset);
  }

  // 재사용 가능한 필터 로직
  private buildFilters(filters: RoundFilters): SQL | undefined {
    const conditions: SQL[] = [];

    if (filters.type) {
      conditions.push(eq(rounds.type, filters.type));
    }

    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(rounds.status, filters.statuses));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
```

---

## 실전 예시: Bets API 구현

### 간단한 API (Repository 없이)

```typescript
// app/api/bets/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bet = await registry.betService.getBetById(params.id);
    return createSuccessResponse({ bet });
  } catch (error) {
    return handleApiError(error);
  }
}

// lib/bets/service.ts
export class BetService {
  // 간단한 조회 → Repository 불필요
  async getBetById(id: string): Promise<Bet> {
    const db = getDb();
    const result = await db.select().from(bets).where(eq(bets.id, id));

    if (!result[0]) {
      throw new NotFoundError('Bet', id);
    }

    return result[0];
  }
}
```

### 복잡한 API (Repository 필요)

```typescript
// app/api/bets/route.ts
export async function GET(request: NextRequest) {
  try {
    const params = parseQueryParams(request);
    const result = await registry.betService.getUserBets(params);
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// lib/bets/service.ts
export class BetService {
  private repository: BetRepository;

  // 복잡한 조회 → Repository 사용
  async getUserBets(params: unknown): Promise<GetBetsResult> {
    // 1. 검증
    const validated = getBetsQuerySchema.parse(params);

    // 2. Repository 호출 (복잡한 필터링)
    const [bets, total] = await Promise.all([
      this.repository.findByUser(validated.userId, {
        roundId: validated.roundId,
        statuses: validated.statuses,
        prediction: validated.prediction,
        limit: validated.pageSize,
        offset: (validated.page - 1) * validated.pageSize,
      }),
      this.repository.countByUser(validated.userId, { ... }),
    ]);

    // 3. 비즈니스 로직 (통계 계산)
    const stats = this.calculateBetStats(bets);

    return { bets, meta: { ... }, stats };
  }
}

// lib/bets/repository.ts
export class BetRepository {
  // 복잡한 필터링 + JOIN
  async findByUser(userId: string, filters: BetFilters): Promise<Bet[]> {
    const db = getDb();

    let query = db
      .select({
        bet: bets,
        round: rounds,
      })
      .from(bets)
      .leftJoin(rounds, eq(bets.roundId, rounds.id))
      .where(eq(bets.userId, userId));

    // 동적 필터 추가
    if (filters.roundId) {
      query = query.where(eq(bets.roundId, filters.roundId));
    }

    if (filters.statuses) {
      query = query.where(inArray(bets.status, filters.statuses));
    }

    if (filters.prediction) {
      query = query.where(eq(bets.prediction, filters.prediction));
    }

    return query
      .orderBy(desc(bets.createdAt))
      .limit(filters.limit)
      .offset(filters.offset);
  }
}
```

---

## 의사결정 플로우차트

```
새 API 구현 시작
    ↓
┌─────────────────────────┐
│ 쿼리가 5줄 이하인가?    │
└─────────┬───────┬───────┘
          YES     NO
           ↓       ↓
    Service에    Repository로
    직접 작성     분리
           ↓       ↓
    ┌──────────────────┐
    │ 2곳 이상 재사용? │
    └──────┬───────────┘
           YES
            ↓
       Repository로
         이동
```

---

## Week별 적용 계획

### Week 1-2: 빠른 구현

```
✅ Controller-Service 분리
✅ 입력 검증 (Zod)
✅ 에러 처리

⚠️ Repository: 복잡한 것만
❌ 테스트: 나중에
❌ 문서화: 최소한만
```

### Week 3: 리팩토링

```
✅ 중복 쿼리 → Repository로 이동
✅ 핵심 로직 테스트 추가
✅ 복잡한 부분 문서화
```

### Week 4: 안정화

```
✅ 전체 테스트 커버리지 확인
✅ 성능 최적화
✅ 운영 문서 작성
```

---

## 요약: 당신의 프로젝트 규모라면

| 레이어 | 적용 수준 | 비고 |
|--------|----------|------|
| Controller | 100% | HTTP만 처리 |
| Service | 100% | 비즈니스 로직 |
| Repository | 30-50% | 복잡한 쿼리만 |
| Shared Utils | 100% | 재사용 유틸 |
| Tests | 50% | 핵심 로직만 |

**핵심**: "완벽한 아키텍처"보다 "빠른 배포 + 점진적 개선"

---

## 마지막 조언

1. **처음엔 Service에 다 넣어라**
   - 일단 동작하게 만들기

2. **중복 발견 시 Repository로 분리**
   - 리팩토링은 그때 해도 늦지 않음

3. **테스트는 버그 나올 때 추가**
   - 완벽한 커버리지는 불필요

4. **문서는 헷갈릴 때 작성**
   - 명확한 코드는 문서가 필요 없음

**결론**: ARCHITECTURE_GUIDE.md는 "이상향"이고,
이 문서는 "현실"입니다. 상황에 맞게 조절하세요! 🎯
