# API 파라미터 별칭(Alias) 사용 여부 결정

**질문**: status 파라미터를 별칭으로 받아야 하나, 실제 DB 값 그대로 받아야 하나?

**현재 구현**:

```typescript
// 별칭 허용
GET /api/rounds?status=OPEN  → BETTING_OPEN으로 변환
GET /api/rounds?status=ACTIVE → BETTING_OPEN으로 변환
GET /api/rounds?status=LOCKED → BETTING_LOCKED로 변환
```

---

## 옵션 비교

### Option A: 별칭 허용 (현재 방식)

```typescript
// Controller
const STATUS_ALIAS = {
  OPEN: 'BETTING_OPEN',
  ACTIVE: 'BETTING_OPEN',
  LOCKED: 'BETTING_LOCKED',
  CLOSED: 'SETTLED',
};

const statuses = rawStatusValues
  .map((value) => registry.roundService.normalizeStatus(value))
  .filter(Boolean);
```

**장점**:

- ✅ 사용자 편의성 (`OPEN`이 `BETTING_OPEN`보다 짧음)
- ✅ 여러 표현 허용 (`OPEN`, `ACTIVE` 모두 동일)
- ✅ DB 스키마 변경 시 API는 그대로 유지 가능

**단점**:

- ❌ 복잡도 증가 (별칭 → 실제값 변환 로직)
- ❌ 문서화 복잡 (어떤 별칭이 가능한지 명시 필요)
- ❌ 혼란 가능성 (`OPEN`과 `BETTING_OPEN` 중 뭘 써야 하나?)
- ❌ 유지보수 부담 (별칭 추가/수정 관리)

---

### Option B: 실제 DB 값만 허용 (추천)

```typescript
// Controller - 별칭 없이 그대로 전달
const statuses = searchParams.getAll('status'); // 그대로 전달

// Zod - 실제 DB 값만 검증
z.array(z.enum(['BETTING_OPEN', 'BETTING_LOCKED', 'SETTLED', ...]))
```

**장점**:

- ✅ **단순함** (변환 로직 불필요)
- ✅ **명확함** (DB 값 = API 값)
- ✅ **일관성** (프론트엔드도 동일한 값 사용)
- ✅ **유지보수 쉬움** (별칭 관리 불필요)

**단점**:

- ❌ 파라미터 이름이 김 (`BETTING_OPEN` vs `OPEN`)
- ❌ DB 스키마 변경 시 API도 변경 필요

---

## 실제 서비스 사례 조사

### GitHub API

```bash
# 실제 값만 사용
GET /repos/:owner/:repo/issues?state=open
GET /repos/:owner/:repo/issues?state=closed
GET /repos/:owner/:repo/issues?state=all

# 별칭 없음, 명확한 값
```

### Stripe API

```bash
# 실제 값만 사용
GET /v1/charges?status=succeeded
GET /v1/charges?status=pending
GET /v1/charges?status=failed

# 별칭 없음, 명확한 값
```

### Twitter API

```bash
# 실제 값만 사용
GET /tweets?tweet.fields=created_at,author_id
GET /tweets?expansions=author_id

# 별칭 없음
```

### Shopify API

```bash
# 실제 값만 사용
GET /orders.json?status=open
GET /orders.json?status=closed
GET /orders.json?status=cancelled

# 별칭 없음
```

**결론**: 대부분의 주요 API는 **별칭을 사용하지 않음**

---

## 베스트 프랙티스 원칙

### 1. KISS (Keep It Simple, Stupid)

> "별칭은 복잡도를 추가할 뿐이다. 단순하게 가라."

### 2. Principle of Least Astonishment

> "사용자가 놀라지 않게 하라. DB 값 = API 값이 직관적이다."

### 3. YAGNI (You Aren't Gonna Need It)

> "지금 당장 필요하지 않으면 추가하지 마라."

### 4. Explicit is better than implicit (Python Zen)

> "명시적인 것이 암시적인 것보다 낫다."

---

## 별칭이 유용한 경우 (예외)

### Case 1: 레거시 호환성

```typescript
// 예전 API: status=1,2,3 (숫자)
// 새 API: status=BETTING_OPEN,BETTING_LOCKED (문자열)
// → 레거시 클라이언트를 위해 숫자도 허용

const STATUS_LEGACY_MAP = {
  '1': 'BETTING_OPEN',
  '2': 'BETTING_LOCKED',
  '3': 'SETTLED',
};
```

**당신의 경우**: 새 프로젝트 → 레거시 없음 → 불필요 ❌

---

### Case 2: 매우 긴 DB 값

```typescript
// DB: 'WAITING_FOR_PAYMENT_CONFIRMATION_FROM_THIRD_PARTY_PROVIDER'
// 별칭: 'WAITING_PAYMENT'

// → 이 경우는 별칭이 합리적
```

**당신의 경우**: `BETTING_OPEN` (14자) → 그리 길지 않음 → 불필요 ❌

---

### Case 3: 다국어 지원

```typescript
// 별칭으로 한글도 허용?
const STATUS_ALIAS = {
  '베팅가능': 'BETTING_OPEN',
  '베팅마감': 'BETTING_LOCKED',
};

GET /api/rounds?status=베팅가능
```

**당신의 경우**: 영어만 사용 → 불필요 ❌

---

## 추천: Option B (실제 DB 값만)

### 이유

1. **프로젝트 규모**: 작음 (2-3명)
2. **레거시**: 없음 (새 프로젝트)
3. **복잡도**: 최소화 목표
4. **프론트엔드**: 어차피 DB 값 알아야 함
5. **베스트 프랙티스**: 대부분의 API가 별칭 안 씀

### 구현 변경

**Before (별칭 허용)**:

```typescript
// Controller
const statuses = rawStatusValues
  .map((value) => registry.roundService.normalizeStatus(value))  // 별칭 변환
  .filter(Boolean);

// Service
normalizeStatus(statusValue: string): RoundStatus | null {
  const upperValue = statusValue.toUpperCase();
  const normalized = STATUS_ALIAS[upperValue] ?? upperValue;
  return ROUND_STATUS_SET.has(normalized) ? (normalized as RoundStatus) : null;
}

// constants.ts
export const STATUS_ALIAS: Record<string, RoundStatus> = {
  OPEN: 'BETTING_OPEN',
  ACTIVE: 'BETTING_OPEN',
  LOCKED: 'BETTING_LOCKED',
  CLOSED: 'SETTLED',
};
```

**After (실제 값만)**:

```typescript
// Controller
const statuses = searchParams.getAll('status'); // 그대로 전달

// Validation (Zod가 자동으로 검증)
z.array(z.enum(ROUND_STATUSES)); // 실제 값만 허용

// normalizeStatus 메서드 삭제 ✅
// STATUS_ALIAS 삭제 ✅
```

**줄어드는 코드**:

- `normalizeStatus()` 메서드 (10줄)
- `STATUS_ALIAS` 상수 (5줄)
- Controller 변환 로직 (3줄)
- **총 18줄 삭제** ✅

---

## 실전 가이드

### API 문서 명시

```markdown
### Query Parameters

- `status` (optional): 라운드 상태 필터
  - 허용 값: `BETTING_OPEN`, `BETTING_LOCKED`, `SETTLED`, ...
  - 복수 허용: `?status=BETTING_OPEN&status=SETTLED`
  - 쉼표 구분: `?status=BETTING_OPEN,SETTLED`

**주의**: 정확한 값을 사용해야 합니다.

- ✅ `?status=BETTING_OPEN`
- ❌ `?status=OPEN` (별칭 미지원)
```

### 프론트엔드 상수 공유

```typescript
// shared/constants.ts (프론트/백엔드 공유)
export const ROUND_STATUSES = [
  'BETTING_OPEN',
  'BETTING_LOCKED',
  'SETTLED',
  // ...
] as const;

// 프론트엔드
import { ROUND_STATUSES } from '@/shared/constants';

const status = ROUND_STATUSES[0]; // 'BETTING_OPEN'
```

---

## 예외: type은 별칭 유지 고려

**type의 경우**:

```typescript
// type은 짧으니까 별칭 불필요
GET /api/rounds?type=6HOUR  // ✅ 명확함
GET /api/rounds?type=1DAY   // ✅ 명확함
```

**별칭이 필요할 만한 경우**:

```typescript
// 만약 DB 값이 길다면?
DB: 'SIX_HOUR_ROUND';
별칭: '6HOUR';

// → 이 경우는 별칭이 합리적
```

**당신의 경우**: DB 값이 이미 짧음 (`6HOUR`) → 별칭 불필요 ✅

---

## 최종 추천

### ✅ DO (실제 값만 사용)

```typescript
// API 호출
GET /api/rounds?type=6HOUR&status=BETTING_OPEN,BETTING_LOCKED

// 명확하고 간단
```

### ❌ DON'T (별칭 지원)

```typescript
// API 호출
GET /api/rounds?type=6H&status=OPEN,LOCKED

// 짧지만 혼란스러움 (6H가 뭐지? OPEN이 뭐지?)
```

---

## 마이그레이션 가이드

### 1. STATUS_ALIAS 제거

```diff
// lib/rounds/constants.ts
- export const STATUS_ALIAS: Record<string, RoundStatus> = {
-   OPEN: 'BETTING_OPEN',
-   ACTIVE: 'BETTING_OPEN',
-   LOCKED: 'BETTING_LOCKED',
-   CLOSED: 'SETTLED',
- };
```

### 2. normalizeStatus 제거

```diff
// lib/rounds/service.ts
- normalizeStatus(statusValue: string): RoundStatus | null {
-   const upperValue = statusValue.toUpperCase();
-   const normalized = STATUS_ALIAS[upperValue] ?? upperValue;
-   return ROUND_STATUS_SET.has(normalized) ? (normalized as RoundStatus) : null;
- }
```

### 3. Controller 간소화

```diff
// app/api/rounds/route.ts
function parseQueryParams(request: NextRequest) {
  const { searchParams } = request.nextUrl;

- const rawStatusValues = searchParams
-   .getAll('status')
-   .flatMap((value) => value.split(','))
-   .map((value) => value.trim())
-   .filter(Boolean);
-
- const statuses = rawStatusValues.length > 0
-   ? rawStatusValues
-       .map((value) => registry.roundService.normalizeStatus(value))
-       .filter(Boolean)
-   : undefined;

+ // 쉼표 구분만 처리
+ const rawStatusValues = searchParams
+   .getAll('status')
+   .flatMap((value) => value.split(','))
+   .map((value) => value.trim())
+   .filter(Boolean);
+
+ const statuses = rawStatusValues.length > 0 ? rawStatusValues : undefined;

  return {
    type: searchParams.get('type') ?? undefined,
    statuses,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    order: searchParams.get('order') ?? undefined,
  };
}
```

### 4. Zod가 자동으로 검증

```typescript
// lib/rounds/validation.ts
statuses: z.array(z.enum(ROUND_STATUSES)).optional();

// Zod가 실제 값만 허용
// 잘못된 값 입력 시 자동으로 에러
```

---

## 요약

| 항목            | 별칭 허용 | 실제 값만 |
| --------------- | --------- | --------- |
| 복잡도          | 높음      | 낮음 ✅   |
| 명확성          | 낮음      | 높음 ✅   |
| 유지보수        | 어려움    | 쉬움 ✅   |
| 코드 양         | 많음      | 적음 ✅   |
| 베스트 프랙티스 | ❌        | ✅        |
| 사용자 편의     | 약간 높음 | 약간 낮음 |

**결론**: **실제 값만 사용하세요!** ✅

별칭은 복잡도만 증가시키고, 실질적인 이득이 거의 없습니다.
특히 작은 팀, 새 프로젝트라면 더더욱 불필요합니다.
