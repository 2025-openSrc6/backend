# GET /api/rounds/current 구현 가이드

**엔드포인트**: `GET /api/rounds/current`
**목적**: 현재 활성 라운드 조회 (UI 메인 화면용)
**난이도**: ⭐⭐⭐ (중간)

---

## 📋 목차

1. [전체 플로우](#전체-플로우)
2. [검증 요구사항](#검증-요구사항)
3. [Layer별 구현 가이드](#layer별-구현-가이드)
4. [테스트 케이스](#테스트-케이스)
5. [구현 체크리스트](#구현-체크리스트)

---

## 전체 플로우

```
클라이언트 요청: GET /api/rounds/current?type=6HOUR
    ↓
┌─────────────────────────────────────────────────────┐
│ 1️⃣ Controller Layer                                │
│ app/api/rounds/current/route.ts                     │
└─────────────────────────────────────────────────────┘
    ↓
    Query Parameter 파싱
    ├─ type = "6HOUR" (필수)
    └─ 간단한 존재 여부 체크
    ↓
    registry.roundService.getCurrentRound("6HOUR")
    ↓
┌─────────────────────────────────────────────────────┐
│ 2️⃣ Service Layer                                   │
│ lib/rounds/service.ts                               │
└─────────────────────────────────────────────────────┘
    ↓
    [검증 1] Zod 스키마 검증
    getCurrentRoundQuerySchema.parse({ type: "6HOUR" })
    ├─ type이 '1MIN' | '6HOUR' | '1DAY' 중 하나인가?
    └─ ✅ 통과
    ↓
    repository.findCurrentRound("6HOUR")
    ↓
┌─────────────────────────────────────────────────────┐
│ 3️⃣ Repository Layer                                │
│ lib/rounds/repository.ts                            │
└─────────────────────────────────────────────────────┘
    ↓
    [검증 2] DB 쿼리
    SELECT * FROM rounds
    WHERE type = '6HOUR'
      AND status IN ('BETTING_OPEN', 'BETTING_LOCKED')
    ORDER BY startTime DESC
    LIMIT 1
    ↓
    결과: Round | undefined
    ↓
┌─────────────────────────────────────────────────────┐
│ 4️⃣ Service Layer (계속)                            │
│ lib/rounds/service.ts                               │
└─────────────────────────────────────────────────────┘
    ↓
    [검증 3] 존재 여부 확인
    if (!round) throw new NotFoundError('NO_ACTIVE_ROUND', '...')
    ↓
    [계산] UI용 추가 필드 생성
    ├─ timeRemaining = endTime - now
    ├─ bettingTimeRemaining = lockTime - now
    ├─ goldBetsPercentage = (totalGoldBets / totalPool) * 100
    ├─ btcBetsPercentage = (totalBtcBets / totalPool) * 100
    ├─ canBet = status === 'BETTING_OPEN' && now < lockTime
    └─ bettingClosesIn = formatTimeMMSS(bettingTimeRemaining)
    ↓
    return { ...round, ...calculatedFields }
    ↓
┌─────────────────────────────────────────────────────┐
│ 5️⃣ Controller Layer (응답)                         │
│ app/api/rounds/current/route.ts                     │
└─────────────────────────────────────────────────────┘
    ↓
    createSuccessResponse({ round: result })
    ↓
    200 OK
    {
      success: true,
      data: {
        round: {
          id, roundNumber, type, status,
          timeRemaining, canBet, ...
        }
      }
    }
```

---

## 검증 요구사항

### 1️⃣ Controller Layer 검증

**파일**: `app/api/rounds/current/route.ts`

| 검증 항목          | 조건                                | 실패 시         |
| ------------------ | ----------------------------------- | --------------- |
| type 존재          | `searchParams.get('type')` !== null | ValidationError |
| type 비어있지 않음 | type !== ''                         | ValidationError |

**구현**:

```typescript
const type = request.nextUrl.searchParams.get('type');

if (!type || type.trim() === '') {
  throw new ValidationError('type parameter is required');
}
```

---

### 2️⃣ Service Layer 검증 (Zod)

**파일**: `lib/rounds/validation.ts`

**스키마**:

```typescript
export const getCurrentRoundQuerySchema = z.object({
  type: z.enum(['1MIN', '6HOUR', '1DAY'], {
    required_error: 'type parameter is required',
    invalid_type_error: 'type must be one of: 1MIN, 6HOUR, 1DAY',
  }),
});
```

**검증 내용**:
| 항목 | 검증 규칙 | 에러 메시지 |
|------|----------|------------|
| type | '1MIN' \| '6HOUR' \| '1DAY' | type must be one of: 1MIN, 6HOUR, 1DAY |

**실패 예시**:

```typescript
// type이 "INVALID"인 경우
ZodError: [
  {
    code: 'invalid_enum_value',
    message: 'type must be one of: 1MIN, 6HOUR, 1DAY',
    path: ['type'],
  },
];
```

---

### 3️⃣ Repository Layer 검증

**파일**: `lib/rounds/repository.ts`

**쿼리 조건**:

```typescript
WHERE:
  1. type = ? (파라미터로 전달된 값)
  2. status IN ('BETTING_OPEN', 'BETTING_LOCKED')
     → "활성" 라운드의 정의

ORDER BY:
  startTime DESC (가장 최근 시작한 라운드)

LIMIT: 1
```

**"활성 라운드"의 정의**:

- `BETTING_OPEN`: 현재 베팅 가능
- `BETTING_LOCKED`: 베팅은 마감됐지만 아직 종료 전 (진행 중)

**제외되는 상태**:

- `SCHEDULED`: 아직 시작 안 함
- `PRICE_PENDING`, `CALCULATING`, `SETTLED`: 이미 종료됨
- `CANCELLED`, `VOIDED`: 취소/무효

---

### 4️⃣ Service Layer 비즈니스 검증

**파일**: `lib/rounds/service.ts`

**존재 여부 확인**:

```typescript
if (!round) {
  throw new NotFoundError('NO_ACTIVE_ROUND', '현재 진행 중인 라운드가 없습니다');
}
```

---

## Layer별 구현 가이드

### 1️⃣ Controller Layer

**파일**: `app/api/rounds/current/route.ts`

```typescript
export async function GET(request: NextRequest) {
  try {
    // 1. Query Parameter 파싱
    const type = request.nextUrl.searchParams.get('type');

    // 간단한 검증 (존재 여부만)
    if (!type || type.trim() === '') {
      throw new ValidationError('type parameter is required');
    }

    // 2. Service 호출
    const result = await registry.roundService.getCurrentRound(type);

    // 3. 응답 반환
    return createSuccessResponse({ round: result });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**역할**:

- ✅ HTTP 요청 파싱
- ✅ Service 호출
- ✅ HTTP 응답 생성
- ❌ 비즈니스 로직 (Service로)
- ❌ DB 접근 (Repository로)

---

### 2️⃣ Validation Layer

**파일**: `lib/rounds/validation.ts`

```typescript
import { z } from 'zod';
import { ROUND_TYPES } from './constants';

/**
 * GET /api/rounds/current 검증 스키마
 */
export const getCurrentRoundQuerySchema = z.object({
  type: z.enum(ROUND_TYPES as [string, ...string[]], {
    required_error: 'type parameter is required',
    invalid_type_error: `type must be one of: ${ROUND_TYPES.join(', ')}`,
  }),
});

export type ValidatedGetCurrentRoundQuery = z.infer<typeof getCurrentRoundQuerySchema>;
```

**역할**:

- ✅ 타입 검증 (enum)
- ✅ 런타임 검증 (Zod)
- ✅ 자동 타입 추론

---

### 3️⃣ Service Layer

**파일**: `lib/rounds/service.ts`

```typescript
/**
 * 현재 활성 라운드 조회
 *
 * @param rawType - 검증되지 않은 type 파라미터
 * @returns 현재 활성 라운드 + UI용 추가 필드
 * @throws {ValidationError} type이 유효하지 않을 때
 * @throws {NotFoundError} 현재 활성 라운드가 없을 때
 */
async getCurrentRound(rawType: unknown): Promise<CurrentRoundResult> {
  // 1. 입력 검증 (Zod)
  const validated = getCurrentRoundQuerySchema.parse({ type: rawType });

  // 2. Repository 호출
  const round = await this.repository.findCurrentRound(validated.type);

  // 3. 존재 여부 확인
  if (!round) {
    throw new NotFoundError(
      'NO_ACTIVE_ROUND',
      '현재 진행 중인 라운드가 없습니다'
    );
  }

  // 4. UI용 추가 필드 계산
  const now = Math.floor(Date.now() / 1000);

  const timeRemaining = Math.max(0, round.endTime - now);
  const bettingTimeRemaining = Math.max(0, round.lockTime - now);

  const goldBetsPercentage = round.totalPool > 0
    ? ((round.totalGoldBets / round.totalPool) * 100).toFixed(2)
    : "0.00";

  const btcBetsPercentage = round.totalPool > 0
    ? ((round.totalBtcBets / round.totalPool) * 100).toFixed(2)
    : "0.00";

  const canBet = round.status === 'BETTING_OPEN' && now < round.lockTime;

  const bettingClosesIn = this.formatTimeMMSS(bettingTimeRemaining);

  // 5. 결과 반환
  return {
    ...round,
    timeRemaining,
    bettingTimeRemaining,
    goldBetsPercentage,
    btcBetsPercentage,
    canBet,
    bettingClosesIn,
  };
}

/**
 * 초를 MM:SS 형식으로 변환
 * @private
 */
private formatTimeMMSS(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
```

**역할**:

- ✅ 입력 검증 (Zod)
- ✅ Repository 호출
- ✅ 비즈니스 로직 (존재 여부, 추가 계산)
- ✅ 에러 발생 (NotFoundError)
- ❌ HTTP 의존성

---

### 4️⃣ Repository Layer

**파일**: `lib/rounds/repository.ts`

```typescript
/**
 * 현재 활성 라운드 조회
 *
 * "활성"의 정의:
 * - status가 'BETTING_OPEN' 또는 'BETTING_LOCKED'
 * - 가장 최근 시작한 라운드 (startTime DESC)
 *
 * @param type - 라운드 타입
 * @returns 라운드 또는 undefined
 */
async findCurrentRound(type: RoundType): Promise<Round | undefined> {
  const db = getDb();

  const result = await db
    .select()
    .from(rounds)
    .where(
      and(
        eq(rounds.type, type),
        inArray(rounds.status, ['BETTING_OPEN', 'BETTING_LOCKED'])
      )
    )
    .orderBy(desc(rounds.startTime))
    .limit(1);

  return result[0];
}
```

**역할**:

- ✅ DB 쿼리 생성
- ✅ 필터링 (type, status)
- ✅ 정렬 (startTime DESC)
- ❌ 비즈니스 로직
- ❌ 에러 처리 (Service에서)

---

### 5️⃣ Types

**파일**: `lib/rounds/types.ts`

```typescript
/**
 * getCurrentRound 반환 타입
 */
export interface CurrentRoundResult extends Round {
  // UI용 추가 필드
  timeRemaining: number; // 종료까지 남은 초
  bettingTimeRemaining: number; // 베팅 마감까지 남은 초
  goldBetsPercentage: string; // "53.33" (%)
  btcBetsPercentage: string; // "46.67" (%)
  canBet: boolean; // 베팅 가능 여부
  bettingClosesIn: string; // "00:45" (MM:SS)

  // 실시간 가격 (나중에 추가)
  currentGoldPrice?: string;
  currentBtcPrice?: string;
}
```

---

## 테스트 케이스

### ✅ 성공 케이스

```bash
# 요청
GET /api/rounds/current?type=6HOUR

# 응답: 200 OK
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roundNumber": 42,
      "type": "6HOUR",
      "status": "BETTING_OPEN",

      "startTime": 1700000000,
      "endTime": 1700021600,
      "lockTime": 1700000060,

      "goldStartPrice": "2650.50",
      "btcStartPrice": "98234.00",

      "totalPool": 1500000,
      "totalGoldBets": 800000,
      "totalBtcBets": 700000,
      "totalBetsCount": 150,

      "timeRemaining": 21540,
      "bettingTimeRemaining": 45,
      "goldBetsPercentage": "53.33",
      "btcBetsPercentage": "46.67",
      "canBet": true,
      "bettingClosesIn": "00:45",

      "createdAt": 1699999400,
      "updatedAt": 1700000015
    }
  }
}
```

---

### ❌ 실패 케이스 1: type 없음

```bash
# 요청
GET /api/rounds/current

# 응답: 400 Bad Request
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "type parameter is required"
  }
}
```

---

### ❌ 실패 케이스 2: type 유효하지 않음

```bash
# 요청
GET /api/rounds/current?type=INVALID

# 응답: 400 Bad Request
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      {
        "code": "invalid_enum_value",
        "message": "type must be one of: 1MIN, 6HOUR, 1DAY",
        "path": ["type"]
      }
    ]
  }
}
```

---

### ❌ 실패 케이스 3: 현재 활성 라운드 없음

```bash
# 요청
GET /api/rounds/current?type=6HOUR

# 시나리오: 6시간 라운드가 모두 종료되고 다음 라운드가 아직 시작 안 됨

# 응답: 404 Not Found
{
  "success": false,
  "error": {
    "code": "NO_ACTIVE_ROUND",
    "message": "현재 진행 중인 라운드가 없습니다"
  }
}
```

---

## 구현 체크리스트

### Controller Layer (`app/api/rounds/current/route.ts`)

- [ ] Query Parameter 파싱 (`type`)
- [ ] type 존재 여부 검증
- [ ] Service 호출 (`getCurrentRound`)
- [ ] 성공 응답 반환 (`createSuccessResponse`)
- [ ] 에러 처리 (`handleApiError`)

### Validation Layer (`lib/rounds/validation.ts`)

- [ ] `getCurrentRoundQuerySchema` 스키마 추가
- [ ] `type` 필드 enum 검증
- [ ] 에러 메시지 정의
- [ ] 타입 export (`ValidatedGetCurrentRoundQuery`)

### Service Layer (`lib/rounds/service.ts`)

- [ ] `getCurrentRound` 메서드 추가
- [ ] Zod 검증 (`getCurrentRoundQuerySchema.parse`)
- [ ] Repository 호출 (`findCurrentRound`)
- [ ] 존재 여부 확인 (`NotFoundError`)
- [ ] `timeRemaining` 계산
- [ ] `bettingTimeRemaining` 계산
- [ ] `goldBetsPercentage` 계산
- [ ] `btcBetsPercentage` 계산
- [ ] `canBet` 판단
- [ ] `bettingClosesIn` 변환
- [ ] `formatTimeMMSS` helper 함수

### Repository Layer (`lib/rounds/repository.ts`)

- [ ] `findCurrentRound` 메서드 추가
- [ ] WHERE 조건 (`type`, `status IN (...)`)
- [ ] ORDER BY `startTime DESC`
- [ ] LIMIT 1

### Types (`lib/rounds/types.ts`)

- [ ] `CurrentRoundResult` 인터페이스 정의
- [ ] UI용 추가 필드 타입 포함

### Error Handling (`lib/shared/errors.ts`)

- [ ] `NotFoundError` 확인 (이미 존재하는지)
- [ ] `NO_ACTIVE_ROUND` 에러 코드 사용

---

## GET /api/rounds vs GET /api/rounds/current 차이

| 항목      | GET /api/rounds              | GET /api/rounds/current     |
| --------- | ---------------------------- | --------------------------- |
| 목적      | 라운드 목록 조회             | 현재 활성 라운드 1개 조회   |
| 반환      | 배열 + 페이지네이션          | 단일 객체                   |
| 필터      | type, status, page, pageSize | type만 (필수)               |
| UI용 필드 | ❌ 없음                      | ✅ timeRemaining, canBet 등 |
| 사용처    | 라운드 리스트 페이지         | 메인 화면 베팅 UI           |
| 복잡도    | ⭐⭐⭐⭐ (복잡)              | ⭐⭐⭐ (중간)               |

---

## 다음 단계

1. ✅ Controller 구현 (이 가이드 참고)
2. ✅ Validation 스키마 추가
3. ✅ Service 메서드 구현
4. ✅ Repository 메서드 구현
5. ✅ Types 정의
6. 🔜 수동 테스트 (Postman/Thunder Client)
7. 🔜 프론트엔드 연동
8. 🔜 실시간 가격 연동 (현준님 API)

---

## 참고 자료

- **API 명세**: `docs/ehdnd/API_SPECIFICATION.md` (207-274줄)
- **아키텍처 가이드**: `docs/ehdnd/ARCHITECTURE_GUIDE.md`
- **GET /api/rounds 참고**: `app/api/rounds/route.refactored.ts`
