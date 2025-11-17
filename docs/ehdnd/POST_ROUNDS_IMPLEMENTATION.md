# POST /api/rounds 구현 로드맵

> **목적**: Admin이 새로운 라운드를 수동으로 생성하는 API 엔드포인트 구현
> **파일**: `app/api/rounds/route.ts`

---

## 📋 목차

1. [API 명세 검토 및 개선](#1-api-명세-검토-및-개선)
2. [구현 체크리스트](#2-구현-체크리스트)
3. [단계별 구현 가이드](#3-단계별-구현-가이드)
4. [테스트 시나리오](#4-테스트-시나리오)
5. [트러블슈팅](#5-트러블슈팅)

---

## 1. API 명세 검토 및 개선

### 현재 명세 (API_SPECIFICATION.md) - 개선 버전

```typescript
POST /api/rounds (Admin)

Request Body:
{
  "type": "6HOUR",
  "startTime": 1700000000    // Unix timestamp (초)
}

Response:
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roundNumber": 43,
      "status": "SCHEDULED",
      // ...
    }
  }
}
```

### 개선 사항

**1. Request Body 간소화 (중요!)**
- ✅ **개선**: `endTime`과 `lockTime`을 수동 입력 → 자동 계산
- **이유**:
  - `type`에 따라 duration이 고정되어 있음 (6HOUR = 6시간, 1MIN = 1분 등)
  - 수동 입력 시 계산 실수 가능성 높음
  - API 호출이 더 간단해짐
- **자동 계산 로직**:
  ```typescript
  endTime = startTime + ROUND_DURATIONS[type]
  lockTime = startTime + BETTING_DURATIONS[type]

  // 예시: type = '6HOUR'
  // endTime = startTime + 6시간
  // lockTime = startTime + 1분
  ```

**2. Validation 간소화**
- `type`: '1MIN' | '6HOUR' | '1DAY' 검증
- `startTime`: 양수 Unix timestamp 검증
- ~~`startTime < endTime` 검증~~ (자동 계산으로 불필요)
- ~~`lockTime` 범위 검증~~ (자동 계산으로 불필요)

**2. Response Body 개선**
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roundNumber": 43,          // 자동 생성 (마지막 roundNumber + 1)
      "type": "6HOUR",
      "status": "SCHEDULED",      // 초기 상태 고정

      // 시간 정보
      "startTime": 1700000000,
      "endTime": 1700021600,
      "lockTime": 1700000060,

      // 가격 정보 (초기값 null)
      "goldStartPrice": null,
      "btcStartPrice": null,
      "goldEndPrice": null,
      "btcEndPrice": null,

      // 풀 정보 (초기값 0)
      "totalPool": 0,
      "totalGoldBets": 0,
      "totalBtcBets": 0,
      "totalBetsCount": 0,

      // 기타
      "winner": null,
      "createdAt": 1699999400,
      "updatedAt": 1699999400
    }
  }
}
```

**3. 에러 케이스 추가**
```typescript
// 시간 검증 실패
{
  "success": false,
  "error": {
    "code": "INVALID_TIME_RANGE",
    "message": "startTime must be before endTime",
    "details": {
      "startTime": 1700021600,
      "endTime": 1700000000
    }
  }
}

// 중복 라운드 (같은 시간대)
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ROUND",
    "message": "A round already exists for this time period",
    "details": {
      "existingRoundId": "uuid",
      "conflictingTime": "startTime"
    }
  }
}

// 권한 없음
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin role required"
  }
}
```

---

## 2. 구현 체크리스트

### Controller Layer (`app/api/rounds/route.ts`)
- [ ] POST 핸들러 함수 추가
- [ ] Request Body 파싱
- [ ] Service 호출
- [ ] 성공/실패 응답 반환

### Validation Layer (`lib/rounds/validation.ts`)
- [ ] `createRoundSchema` 추가
  - [ ] type 검증
  - [ ] startTime, endTime, lockTime 검증
  - [ ] 시간 순서 검증 (startTime < lockTime < endTime)
  - [ ] 최소 베팅 시간 검증 (lockTime >= startTime + 60초)

### Service Layer (`lib/rounds/service.ts`)
- [ ] `createRound()` 메서드 추가
  - [ ] 입력 검증
  - [ ] roundNumber 계산 (마지막 + 1)
  - [ ] 중복 라운드 체크
  - [ ] Repository 호출

### Repository Layer (`lib/rounds/repository.ts`)
- [ ] `getLastRoundNumber()` 메서드 추가 (type별)
- [ ] `findOverlappingRounds()` 메서드 추가
- [ ] `insert()` 메서드 추가

### Types Layer (`lib/rounds/types.ts`)
- [ ] `CreateRoundInput` 타입 추가
- [ ] `CreateRoundResult` 타입 추가

---

## 3. 단계별 구현 가이드

### Step 1: Validation Schema 작성 (lib/rounds/validation.ts)

```typescript
/**
 * POST /api/rounds Request Body 검증 스키마 (간소화 버전)
 */
export const createRoundSchema = z.object({
  type: z.enum(ROUND_TYPES as [string, ...string[]], {
    message: `type must be one of: ${ROUND_TYPES.join(', ')}`,
  }),

  startTime: z.number().int().positive({
    message: 'startTime must be a positive Unix timestamp',
  }),
});

export type ValidatedCreateRound = z.infer<typeof createRoundSchema>;
```

**변경 사항**:
- ❌ `endTime`, `lockTime` 필드 제거
- ❌ `.refine()` 검증 로직 제거 (자동 계산으로 불필요)
- ✅ 훨씬 간단한 스키마!

### Step 2: Repository 메서드 추가 (lib/rounds/repository.ts)

```typescript
/**
 * 특정 타입의 마지막 roundNumber 조회
 *
 * @param type - 라운드 타입
 * @returns 마지막 roundNumber 또는 0 (없으면)
 */
async getLastRoundNumber(type: RoundType): Promise<number> {
  const db = getDb();

  const result = await db
    .select({ roundNumber: rounds.roundNumber })
    .from(rounds)
    .where(eq(rounds.type, type))
    .orderBy(desc(rounds.roundNumber))
    .limit(1);

  return result[0]?.roundNumber ?? 0;
}

/**
 * 시간이 겹치는 라운드 찾기
 *
 * 검증 로직:
 * - 새 라운드의 [startTime, endTime] 구간이
 * - 기존 라운드의 [startTime, endTime] 구간과 겹치면 안 됨
 *
 * @param type - 라운드 타입
 * @param startTime - 시작 시각
 * @param endTime - 종료 시각
 * @returns 겹치는 라운드 배열
 */
async findOverlappingRounds(
  type: RoundType,
  startTime: Date,
  endTime: Date
): Promise<Round[]> {
  const db = getDb();

  // SQL: WHERE type = ? AND (
  //   (start_time >= ? AND start_time < ?) OR
  //   (end_time > ? AND end_time <= ?) OR
  //   (start_time <= ? AND end_time >= ?)
  // )

  const result = await db
    .select()
    .from(rounds)
    .where(
      and(
        eq(rounds.type, type),
        or(
          // 새 라운드 시작 시각이 기존 라운드 구간 안에 있음
          and(
            sql`${rounds.startTime} <= ${startTime}`,
            sql`${rounds.endTime} > ${startTime}`
          ),
          // 새 라운드 종료 시각이 기존 라운드 구간 안에 있음
          and(
            sql`${rounds.startTime} < ${endTime}`,
            sql`${rounds.endTime} >= ${endTime}`
          ),
          // 기존 라운드가 새 라운드 구간 안에 완전히 포함됨
          and(
            sql`${rounds.startTime} >= ${startTime}`,
            sql`${rounds.endTime} <= ${endTime}`
          )
        )
      )
    );

  return result;
}

/**
 * 새 라운드 생성
 *
 * @param round - 라운드 데이터
 * @returns 생성된 라운드
 */
async insert(round: RoundInsert): Promise<Round> {
  const db = getDb();

  const result = await db.insert(rounds).values(round).returning();
  return result[0];
}
```

### Step 3: Service 메서드 추가 (lib/rounds/service.ts)

```typescript
/**
 * 새 라운드 생성 (Admin 전용)
 *
 * @param rawInput - 검증되지 않은 입력
 * @returns 생성된 라운드
 *
 * @throws {ValidationError} 입력 검증 실패
 * @throws {BusinessError} 중복 라운드, 시간 충돌 등
 *
 * @example
 * const round = await roundService.createRound({
 *   type: '6HOUR',
 *   startTime: 1700000000,
 * });
 */
async createRound(rawInput: unknown): Promise<Round> {
  // 1. 입력 검증 (Zod)
  const validated = createRoundSchema.parse(rawInput);

  // 2. 시간 자동 계산 (중요!)
  const startTimeDate = new Date(validated.startTime * 1000);
  const roundDuration = ROUND_DURATIONS[validated.type]; // 초 단위
  const bettingDuration = BETTING_DURATIONS[validated.type]; // 초 단위

  const endTimeDate = new Date((validated.startTime + roundDuration) * 1000);
  const lockTimeDate = new Date((validated.startTime + bettingDuration) * 1000);

  // 3. 마지막 roundNumber 조회 → +1
  const lastRoundNumber = await this.repository.getLastRoundNumber(validated.type);
  const newRoundNumber = lastRoundNumber + 1;

  // 4. 중복 시간 체크
  const overlapping = await this.repository.findOverlappingRounds(
    validated.type,
    startTimeDate,
    endTimeDate
  );

  if (overlapping.length > 0) {
    throw new BusinessError(
      'DUPLICATE_ROUND',
      'A round already exists for this time period',
      {
        existingRoundId: overlapping[0].id,
        conflictingTime: 'startTime-endTime',
      }
    );
  }

  // 5. RoundInsert 객체 생성
  const roundData: RoundInsert = {
    roundNumber: newRoundNumber,
    type: validated.type,
    status: 'SCHEDULED',
    startTime: startTimeDate,
    endTime: endTimeDate,
    lockTime: lockTimeDate,

    // 초기값
    totalPool: 0,
    totalGoldBets: 0,
    totalBtcBets: 0,
    totalBetsCount: 0,
    platformFeeRate: '0.05',
    platformFeeCollected: 0,
    startPriceIsFallback: false,
    endPriceIsFallback: false,
  };

  // 6. Repository 호출
  const createdRound = await this.repository.insert(roundData);

  return createdRound;
}

```

### Step 4: Controller 추가 (app/api/rounds/route.ts)

```typescript
/**
 * POST /api/rounds
 *
 * 새 라운드를 생성합니다 (Admin 전용).
 *
 * Request Body:
 * {
 *   type: '6HOUR',           // 라운드 타입
 *   startTime: 1700000000    // 시작 시각 (Unix timestamp 초)
 * }
 *
 * 참고: endTime과 lockTime은 자동 계산됨
 * - endTime = startTime + ROUND_DURATIONS[type]
 * - lockTime = startTime + BETTING_DURATIONS[type]
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     round: {
 *       id: "uuid",
 *       roundNumber: 43,
 *       status: "SCHEDULED",
 *       // ... (전체 라운드 정보)
 *     }
 *   }
 * }
 *
 * 에러 Response:
 * {
 *   success: false,
 *   error: {
 *     code: "DUPLICATE_ROUND" | "INVALID_TIME_RANGE" | ...,
 *     message: "에러 메시지",
 *     details?: { ... }
 *   }
 * }
 *
 * 권한: Admin 필요 (TODO: 인증 미들웨어 추가)
 *
 * @example
 * POST /api/rounds
 * Content-Type: application/json
 *
 * {
 *   "type": "6HOUR",
 *   "startTime": 1700000000,
 *   "endTime": 1700021600,
 *   "lockTime": 1700000060
 * }
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
    const round = await registry.roundService.createRound(body);

    // 4. 성공 응답 반환
    return createSuccessResponse({ round });
  } catch (error) {
    // 5. 에러 처리 (Service 에러 → HTTP 응답)
    return handleApiError(error);
  }
}
```

### Step 5: Types 추가 (lib/rounds/types.ts)

```typescript
/**
 * POST /api/rounds Request Body 타입 (간소화 버전)
 */
export interface CreateRoundInput {
  type: RoundType;
  startTime: number; // Unix timestamp (초)
  // endTime과 lockTime은 자동 계산되므로 제거
}

/**
 * POST /api/rounds Response 타입
 */
export interface CreateRoundResult {
  round: Round;
}
```

---

## 4. 테스트 시나리오

### 성공 케이스

**1. 정상적인 6HOUR 라운드 생성**
```bash
POST /api/rounds
{
  "type": "6HOUR",
  "startTime": 1700000000    # 2023-11-15 02:00:00 KST
}

예상 결과:
- roundNumber: 1 (첫 라운드인 경우)
- status: 'SCHEDULED'
- startTime: 1700000000
- endTime: 1700021600 (자동 계산: startTime + 6시간)
- lockTime: 1700000060 (자동 계산: startTime + 1분)
- 모든 가격 필드: null
- 모든 풀 필드: 0
```

**2. 두 번째 라운드 생성 (roundNumber 자동 증가)**
```bash
POST /api/rounds
{
  "type": "6HOUR",
  "startTime": 1700021600    # 첫 라운드 종료 시각
}

예상 결과:
- roundNumber: 2 (자동 증가)
- endTime: 1700043200 (자동 계산)
- lockTime: 1700021660 (자동 계산)
```

### 실패 케이스

**1. 잘못된 type**
```bash
POST /api/rounds
{
  "type": "2HOUR",           # 지원하지 않는 타입 ❌
  "startTime": 1700000000
}

예상 에러:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "type must be one of: 1MIN, 6HOUR, 1DAY"
  }
}
```

**2. 잘못된 startTime**
```bash
POST /api/rounds
{
  "type": "6HOUR",
  "startTime": -1            # 음수 ❌
}

예상 에러:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "startTime must be a positive Unix timestamp"
  }
}
```

**3. 중복 시간대**
```bash
# 첫 번째 라운드 생성
POST /api/rounds
{
  "type": "6HOUR",
  "startTime": 1700000000    # 02:00 ~ 08:00
}

# 겹치는 시간대로 두 번째 라운드 생성 시도
POST /api/rounds
{
  "type": "6HOUR",
  "startTime": 1700010800    # 05:00 시작 (첫 라운드 진행 중) ❌
}

예상 에러:
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ROUND",
    "message": "A round already exists for this time period",
    "details": {
      "existingRoundId": "uuid",
      "conflictingTime": "startTime-endTime"
    }
  }
}
```

---

## 5. 트러블슈팅

### 문제 1: roundNumber 중복

**증상**: 동시에 2개 라운드 생성 시 같은 roundNumber 발생

**원인**: Race Condition (getLastRoundNumber와 insert 사이)

**해결책**:
```typescript
// Option A: DB Unique Constraint (이미 존재)
// db/schema/rounds.ts에 typeRoundUnique 인덱스 정의됨

// Option B: Transaction 사용
async createRound(rawInput: unknown): Promise<Round> {
  return db.transaction(async (tx) => {
    const lastRoundNumber = await getLastRoundNumber(tx);
    // ... 나머지 로직
  });
}
```

**권장**: Option A (DB Constraint)가 이미 있으므로 추가 작업 불필요.
중복 시 DB가 에러를 던지고, Service에서 catch하여 적절한 에러 반환.

### 문제 2: Timezone 혼동

**증상**: 시간 계산이 KST/UTC 혼동으로 오류

**해결책**:
- 모든 타임스탬프는 **UTC 기준**으로 저장
- 클라이언트에서 KST로 변환 표시
- specification.md 참조:
  ```
  서버 타임존: UTC (KST = UTC+9)
  라운드 1: 17:00 ~ 23:00 UTC (전날)
  라운드 2: 23:00 ~ 05:00 UTC
  ...
  ```

### 문제 3: 가격 필드 null 처리

**증상**: 프론트엔드에서 null 가격으로 인한 에러

**해결책**:
- API Response에서 null을 명시적으로 반환
- 프론트엔드에서 null 체크 후 "가격 대기 중" 표시
- status가 'SCHEDULED'이면 가격이 없는 것이 정상

---

## 6. Cron Job 연동

POST /api/rounds는 Admin 수동 생성 외에도, **Cron Job에서 자동 호출**될 수 있습니다.

### Cron Job 1: Round Creator

```typescript
// lib/cron/round-creator.ts

import { registry } from '@/lib/registry';

/**
 * 라운드 자동 생성 (매일 4회)
 *
 * 실행 시각: 01:50, 07:50, 13:50, 19:50 KST (각 라운드 10분 전)
 *
 * @example
 * // Cloudflare Workers Cron
 * crons = ["50 16,22,4,10 * * *"]  # UTC 기준
 */
export async function createNextRound(type: '6HOUR' = '6HOUR') {
  // 1. 다음 라운드 시간 계산
  const now = Date.now();
  const schedules = getRoundSchedules(type); // specification.md 기준
  const nextSchedule = schedules.find(s => s.startTime > now);

  if (!nextSchedule) {
    console.error('No upcoming schedule found');
    return;
  }

  // 2. RoundService 호출 (내부적으로 POST /api/rounds와 동일 로직)
  try {
    const round = await registry.roundService.createRound({
      type,
      startTime: Math.floor(nextSchedule.startTime / 1000),
      // endTime과 lockTime은 자동 계산됨!
    });

    console.log(`Round #${round.roundNumber} created successfully`);

    // 3. WebSocket 알림 (선택)
    // await broadcastRoundCreated(round);
  } catch (error) {
    console.error('Failed to create round:', error);
    // Slack/Discord 알림
  }
}
```

---

## 7. 참고 자료

- **API 명세**: `docs/ehdnd/API_SPECIFICATION.md`
- **시스템 명세**: `docs/ehdnd/specification.md`
- **DB 스키마**: `db/schema/rounds.ts`
- **기존 구현**: `app/api/rounds/route.ts` (GET)
- **Service 패턴**: `lib/rounds/service.ts`
- **Repository 패턴**: `lib/rounds/repository.ts`

---

## 8. 구현 순서 요약

1. ✅ **Validation** (`lib/rounds/validation.ts`)
   - `createRoundSchema` 추가

2. ✅ **Repository** (`lib/rounds/repository.ts`)
   - `getLastRoundNumber()` 추가
   - `findOverlappingRounds()` 추가
   - `insert()` 추가

3. ✅ **Service** (`lib/rounds/service.ts`)
   - `createRound()` 추가

4. ✅ **Controller** (`app/api/rounds/route.ts`)
   - `POST` 핸들러 추가

5. ✅ **Types** (`lib/rounds/types.ts`)
   - `CreateRoundInput`, `CreateRoundResult` 추가

6. 🔲 **Tests** (선택)
   - Unit tests for Service
   - Integration tests for API

7. 🔲 **Auth Middleware** (향후)
   - Admin 권한 체크

---

**구현 완료 후 확인 사항**:
- [ ] POST /api/rounds 호출 시 라운드 생성됨
- [ ] roundNumber가 자동 증가함
- [ ] 중복 시간대 라운드 생성 시 에러 반환
- [ ] 시간 검증이 정상 작동함
- [ ] DB에 올바르게 저장됨
- [ ] API 응답 포맷이 명세와 일치함
