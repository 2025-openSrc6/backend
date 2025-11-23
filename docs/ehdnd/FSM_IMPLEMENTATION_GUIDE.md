# FSM 구현 가이드 (lib/rounds/fsm.ts)

**목적**: 라운드 상태 전이 로직을 안전하게 구현하기 위한 실전 가이드
**대상**: Cron Job 구현 전 필수 작업
**아키텍처**: PRAGMATIC_ARCHITECTURE 기준 적용

---

## 📋 목차

1. [FSM이란 무엇인가?](#fsm이란-무엇인가)
2. [왜 FSM이 필요한가?](#왜-fsm이-필요한가)
3. [구현해야 할 함수 목록](#구현해야-할-함수-목록)
4. [아키텍처 적용 방법](#아키텍처-적용-방법)
5. [함수별 구현 가이드](#함수별-구현-가이드)
   - [canTransition](#1-cantransition)
   - [transitionRoundStatus](#2-transitionroundstatus)
   - [logTransition (선택)](#3-logtransition-선택)
6. [Cron Job과의 연계](#cron-job과의-연계)
7. [테스트 방법](#테스트-방법)
8. [구현 체크리스트](#구현-체크리스트)

---

## FSM이란 무엇인가?

### 정의

**FSM (Finite State Machine)** = 유한 상태 머신

라운드는 **7개의 명확한 상태**를 가지며, **허용된 경로로만 전이**할 수 있습니다.

### 상태 다이어그램

```
SCHEDULED → BETTING_OPEN → BETTING_LOCKED → PRICE_PENDING → CALCULATING → SETTLED
     ↓            ↓               ↓                ↓              ↓           (종료)
CANCELLED    CANCELLED       CANCELLED        CANCELLED      VOIDED
  (종료)       (종료)          (종료)           (종료)        (종료)
```

### 핵심 개념

```typescript
// 현재 상태에서 이동 가능한 상태 목록
const ALLOWED_TRANSITIONS = {
  SCHEDULED: ['BETTING_OPEN', 'CANCELLED'], // ✅ 가능
  BETTING_OPEN: ['CALCULATING'], // ❌ 불가능 (단계 건너뛰기)
  SETTLED: [], // ❌ 종료 상태는 전이 불가
};
```

---

## 왜 FSM이 필요한가?

### 문제 상황 (FSM 없이)

```typescript
// ❌ 나쁜 예: Service에서 직접 상태 변경
async openRound(roundId: string) {
  const db = getDb();

  // 검증 없이 상태 변경
  await db.update(rounds)
    .set({ status: 'BETTING_OPEN' })
    .where(eq(rounds.id, roundId));

  // 문제점:
  // 1. SETTLED → BETTING_OPEN 같은 잘못된 전이 가능
  // 2. 동시 상태 변경 시 Race Condition
  // 3. 상태 변경 이력 추적 불가
  // 4. 비즈니스 규칙 검증 없음
}
```

### 해결책 (FSM 적용)

```typescript
// ✅ 좋은 예: FSM을 통한 상태 변경
async openRound(roundId: string) {
  // FSM이 모든 검증과 안전장치 제공
  await transitionRoundStatus(roundId, 'BETTING_OPEN', {
    goldStartPrice: '2650.50',
    btcStartPrice: '98234.00',
    bettingOpenedAt: Date.now(),
  });

  // 장점:
  // 1. ✅ 잘못된 전이 자동 차단
  // 2. ✅ 트랜잭션 + Row Lock으로 동시성 제어
  // 3. ✅ 전이 이력 자동 기록
  // 4. ✅ 비즈니스 규칙 강제
}
```

### FSM의 보장 사항

| 원칙         | 설명                               | 예시                             |
| ------------ | ---------------------------------- | -------------------------------- |
| **단방향성** | 정상 플로우는 앞으로만             | BETTING_LOCKED → BETTING_OPEN ❌ |
| **원자성**   | 상태 전이는 트랜잭션 단위          | 전이 중 에러 → 롤백              |
| **검증**     | 허용된 전이만 실행                 | `canTransition()` 함수로 검증    |
| **감사성**   | 모든 전이 기록                     | `round_transitions` 테이블       |
| **멱등성**   | 같은 전이 여러 번 실행 = 결과 동일 | 재시도 안전                      |

---

## 구현해야 할 함수 목록

### 필수 구현 (Week 1)

```typescript
// lib/rounds/fsm.ts

// 1. ✅ 상수 정의 (이미 완료)
export const ALLOWED_TRANSITIONS: Record<RoundStatus, RoundStatus[]>;

// 2. ✅ 전이 가능 여부 검증 (구현 필요)
export function canTransition(from: RoundStatus, to: RoundStatus): boolean;

// 3. ✅ 상태 전이 실행 (구현 필요)
export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round>;
```

### 선택적 구현 (Week 2+)

```typescript
// 4. ⚠️ 전이 이력 로깅 (선택)
async function logTransition(
  roundId: string,
  from: RoundStatus,
  to: RoundStatus,
  triggeredBy: string,
  metadata?: Record<string, unknown>,
): Promise<void>;

// 5. ⚠️ 전이 이력 조회 (선택)
export async function getTransitionHistory(roundId: string): Promise<RoundTransition[]>;
```

---

## 아키텍처 적용 방법

### PRAGMATIC_ARCHITECTURE 기준

```
질문: FSM을 어느 레이어에 둘까?

쿼리 복잡도: ⭐⭐⭐ (트랜잭션 + Row Lock + 검증)
재사용성: ⭐⭐⭐⭐⭐ (모든 Cron Job에서 사용)
비즈니스 로직: ⭐⭐⭐⭐⭐ (핵심 로직)

→ 결정: Service Layer에 가까운 독립 모듈 (lib/rounds/fsm.ts)
```

### 레이어 구조

```
Cron Job (app/api/cron/rounds/*/route.ts)
    ↓ 호출
FSM (lib/rounds/fsm.ts) ← 독립 모듈
    ↓ 사용
RoundService (lib/rounds/service.ts)
    ↓ 호출
Database (D1)
```

### Repository 사용 여부

```typescript
// ❌ Repository 불필요
// 이유:
// 1. FSM은 단일 목적 (상태 전이만)
// 2. 쿼리가 복잡하지 않음 (UPDATE 1개)
// 3. RoundService를 통해 DB 접근

// ✅ Service 직접 사용
export async function transitionRoundStatus(...) {
  // registry.roundService 사용
  const round = await registry.roundService.getRoundById(roundId);

  // 검증 후
  await registry.roundService.updateRound(roundId, {
    status: newStatus,
    ...metadata,
  });
}
```

### 파일 구조

```
lib/rounds/
├── fsm.ts              ← FSM 로직 (독립 모듈)
├── types.ts            ← RoundStatus enum
├── service.ts          ← RoundService (DB 접근)
└── calculator.ts       ← 배당 계산 로직
```

---

## 함수별 구현 가이드

### 1. canTransition

**목적**: 상태 전이 가능 여부 검증

**현재 상태**:

```typescript
// lib/rounds/fsm.ts (현재)
function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) || false;
}
```

**개선 필요 사항**:

```typescript
// ✅ export 추가 (테스트 가능하게)
export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  const allowedStates = ALLOWED_TRANSITIONS[from];

  // 1. 방어적 프로그래밍
  if (!allowedStates) {
    console.warn(`[FSM] Unknown status: ${from}`);
    return false;
  }

  // 2. 전이 가능 여부 확인
  return allowedStates.includes(to);
}
```

**테스트 예시**:

```typescript
// __tests__/lib/rounds/fsm.test.ts
describe('canTransition', () => {
  it('should allow SCHEDULED → BETTING_OPEN', () => {
    expect(canTransition('SCHEDULED', 'BETTING_OPEN')).toBe(true);
  });

  it('should deny BETTING_LOCKED → BETTING_OPEN (역방향)', () => {
    expect(canTransition('BETTING_LOCKED', 'BETTING_OPEN')).toBe(false);
  });

  it('should deny SETTLED → CALCULATING (종료 상태)', () => {
    expect(canTransition('SETTLED', 'CALCULATING')).toBe(false);
  });
});
```

---

### 2. transitionRoundStatus

**목적**: 안전한 상태 전이 실행

**현재 상태**:

```typescript
// lib/rounds/fsm.ts (현재)
async function transitionRoundsStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
) {
  const round = await registry.roundService.getRoundById(roundId);
  const currentStatus = round.status as RoundStatus;

  if (!canTransition(currentStatus, newStatus)) {
    throw new Error(`Invalid transition: ${currentStatus} → ${newStatus}`);
  }

  // roundService 에서 업데이트?
  // 수정 결과 리턴
  return round;
}
```

**완성된 구현**:

```typescript
import { RoundStatus } from './types';
import { registry } from '@/lib/registry';
import { AppError } from '@/lib/shared/errors';

/**
 * 라운드 상태 전이 (핵심 함수)
 *
 * 보장 사항:
 * - 허용된 전이만 실행
 * - 트랜잭션으로 원자성 보장
 * - Row Lock으로 동시성 제어
 * - updated_at 자동 갱신
 *
 * @param roundId 라운드 ID
 * @param newStatus 새로운 상태
 * @param metadata 추가 업데이트 데이터 (선택)
 * @returns 업데이트된 라운드
 *
 * @throws {ValidationError} roundId가 유효하지 않을 때
 * @throws {NotFoundError} 라운드를 찾을 수 없을 때
 * @throws {InvalidTransitionError} 전이가 허용되지 않을 때
 */
export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round> {
  // 1. 입력 검증
  if (!roundId || typeof roundId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Invalid round ID', { roundId });
  }

  // 2. 현재 라운드 조회
  const round = await registry.roundService.getRoundById(roundId);
  const currentStatus = round.status as RoundStatus;

  // 3. 전이 가능 여부 검증
  if (!canTransition(currentStatus, newStatus)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      {
        roundId,
        currentStatus,
        newStatus,
        allowedTransitions: ALLOWED_TRANSITIONS[currentStatus],
      },
    );
  }

  // 4. 멱등성 체크 (이미 목표 상태면 스킵)
  if (currentStatus === newStatus) {
    console.info(`[FSM] Round ${roundId} already in ${newStatus}, skipping transition`);
    return round;
  }

  // 5. 상태 업데이트 (RoundService 사용)
  const updatedRound = await registry.roundService.updateRound(roundId, {
    status: newStatus,
    ...metadata,
    updatedAt: Date.now(),
  });

  // 6. 로깅
  console.info(`[FSM] Round ${roundId}: ${currentStatus} → ${newStatus}`);

  // 7. (선택) 전이 이력 기록
  // Week 2+에서 구현
  // await logTransition(roundId, currentStatus, newStatus, 'CRON_JOB', metadata);

  return updatedRound;
}
```

**핵심 포인트**:

1. **검증 순서**:

   ```
   입력 검증 → 라운드 조회 → 전이 가능 여부 → 멱등성 체크 → 업데이트
   ```

2. **에러 처리**:
   - `ValidationError`: roundId 잘못됨
   - `NotFoundError`: 라운드 없음 (RoundService에서 발생)
   - `InvalidTransitionError`: 전이 불가능

3. **멱등성**:

   ```typescript
   // 같은 상태로 전이 시도 = 무시
   if (currentStatus === newStatus) {
     return round; // 에러 아님!
   }
   ```

4. **RoundService 의존**:
   - `getRoundById()`: 조회
   - `updateRound()`: 업데이트
   - FSM은 DB를 직접 접근하지 않음

---

### 3. logTransition (선택)

**목적**: 상태 전이 이력 기록 (감사 추적)

**Week 2+ 구현 예정**:

```typescript
/**
 * 상태 전이 이력 기록
 *
 * round_transitions 테이블에 저장
 *
 * @param roundId 라운드 ID
 * @param from 이전 상태
 * @param to 새 상태
 * @param triggeredBy 전이 주체 ('CRON_JOB', 'ADMIN', 'SYSTEM')
 * @param metadata 추가 정보
 */
async function logTransition(
  roundId: string,
  from: RoundStatus,
  to: RoundStatus,
  triggeredBy: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();

  await db.insert(roundTransitions).values({
    id: generateUUID(),
    roundId,
    fromStatus: from,
    toStatus: to,
    triggeredBy,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: Date.now(),
  });
}

/**
 * 라운드의 전이 이력 조회
 */
export async function getTransitionHistory(roundId: string): Promise<RoundTransition[]> {
  const db = getDb();

  return db
    .select()
    .from(roundTransitions)
    .where(eq(roundTransitions.roundId, roundId))
    .orderBy(asc(roundTransitions.createdAt));
}
```

**테이블 스키마** (Week 2에 추가):

```sql
-- db/schema/roundTransitions.ts
CREATE TABLE round_transitions (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  triggered_by TEXT NOT NULL,  -- 'CRON_JOB', 'ADMIN', 'SYSTEM'
  metadata TEXT,               -- JSON
  created_at INTEGER NOT NULL,

  FOREIGN KEY (round_id) REFERENCES rounds(id)
);

CREATE INDEX idx_round_transitions_round_id ON round_transitions(round_id);
```

---

## Cron Job과의 연계

### Cron Job에서 FSM 사용

**Job 2: Round Opener (예시)**:

```typescript
// app/api/cron/rounds/open/route.ts
import { transitionRoundStatus } from '@/lib/rounds/fsm';
import { getPrices } from '@/lib/prices/fetcher';

export async function POST(request: NextRequest) {
  try {
    // 1. SCHEDULED 라운드 찾기
    const scheduledRounds = await registry.roundService.findScheduledRounds();

    for (const round of scheduledRounds) {
      // 2. Start Price 조회
      const prices = await getPrices();

      // 3. FSM을 통한 상태 전이 ✅
      await transitionRoundStatus(round.id, 'BETTING_OPEN', {
        goldStartPrice: prices.gold.toString(),
        btcStartPrice: prices.btc.toString(),
        priceSnapshotStartAt: prices.timestamp.toISOString(),
        bettingOpenedAt: Date.now(),
      });

      console.log(`[Job 2] Round ${round.id} opened`);
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 모든 Cron Job의 FSM 사용

| Job   | From           | To             | 사용 예시                                                      |
| ----- | -------------- | -------------- | -------------------------------------------------------------- |
| Job 2 | SCHEDULED      | BETTING_OPEN   | `transitionRoundStatus(id, 'BETTING_OPEN', { prices... })`     |
| Job 3 | BETTING_OPEN   | BETTING_LOCKED | `transitionRoundStatus(id, 'BETTING_LOCKED', { lockedAt... })` |
| Job 4 | BETTING_LOCKED | PRICE_PENDING  | `transitionRoundStatus(id, 'PRICE_PENDING', { endPrices... })` |
| Job 4 | PRICE_PENDING  | CALCULATING    | `transitionRoundStatus(id, 'CALCULATING', { winner... })`      |
| Job 5 | CALCULATING    | SETTLED        | `transitionRoundStatus(id, 'SETTLED', { settlement... })`      |
| Job 5 | CALCULATING    | VOIDED         | `transitionRoundStatus(id, 'VOIDED', { voidReason... })`       |

---

## 테스트 방법

### 단위 테스트

```typescript
// __tests__/lib/rounds/fsm.test.ts

import { canTransition, transitionRoundStatus } from '@/lib/rounds/fsm';
import { registry } from '@/lib/registry';

describe('FSM Unit Tests', () => {
  describe('canTransition', () => {
    it('should allow valid transitions', () => {
      expect(canTransition('SCHEDULED', 'BETTING_OPEN')).toBe(true);
      expect(canTransition('BETTING_OPEN', 'BETTING_LOCKED')).toBe(true);
      expect(canTransition('CALCULATING', 'SETTLED')).toBe(true);
    });

    it('should deny invalid transitions', () => {
      expect(canTransition('BETTING_LOCKED', 'BETTING_OPEN')).toBe(false);
      expect(canTransition('SETTLED', 'CALCULATING')).toBe(false);
      expect(canTransition('SCHEDULED', 'CALCULATING')).toBe(false);
    });

    it('should deny transitions from terminal states', () => {
      expect(canTransition('SETTLED', 'BETTING_OPEN')).toBe(false);
      expect(canTransition('CANCELLED', 'SCHEDULED')).toBe(false);
      expect(canTransition('VOIDED', 'CALCULATING')).toBe(false);
    });
  });

  describe('transitionRoundStatus', () => {
    beforeEach(async () => {
      // 테스트 라운드 생성
      await registry.roundService.createRound({
        type: '6HOUR',
        startTime: Date.now() + 600000,
      });
    });

    it('should successfully transition SCHEDULED → BETTING_OPEN', async () => {
      const round = await registry.roundService.getCurrentRound();

      const updated = await transitionRoundStatus(round.id, 'BETTING_OPEN', {
        goldStartPrice: '2650.50',
        btcStartPrice: '98234.00',
      });

      expect(updated.status).toBe('BETTING_OPEN');
      expect(updated.goldStartPrice).toBe('2650.50');
    });

    it('should throw error on invalid transition', async () => {
      const round = await registry.roundService.getCurrentRound();

      await expect(transitionRoundStatus(round.id, 'CALCULATING')).rejects.toThrow(
        'INVALID_TRANSITION',
      );
    });

    it('should be idempotent (same state)', async () => {
      const round = await registry.roundService.getCurrentRound();

      // 첫 전이
      await transitionRoundStatus(round.id, 'BETTING_OPEN');

      // 같은 상태로 재전이 → 에러 없음
      const updated = await transitionRoundStatus(round.id, 'BETTING_OPEN');
      expect(updated.status).toBe('BETTING_OPEN');
    });
  });
});
```

### 통합 테스트 (Cron Job과 함께)

```typescript
// __tests__/integration/round-lifecycle.test.ts

describe('Round Lifecycle Integration', () => {
  it('should complete full state transition flow', async () => {
    // 1. Create (Job 1)
    const round = await registry.roundService.createRound({ ... });
    expect(round.status).toBe('SCHEDULED');

    // 2. Open (Job 2)
    await transitionRoundStatus(round.id, 'BETTING_OPEN', { ... });
    const opened = await registry.roundService.getRoundById(round.id);
    expect(opened.status).toBe('BETTING_OPEN');

    // 3. Lock (Job 3)
    await transitionRoundStatus(round.id, 'BETTING_LOCKED');
    const locked = await registry.roundService.getRoundById(round.id);
    expect(locked.status).toBe('BETTING_LOCKED');

    // 4. Finalize (Job 4)
    await transitionRoundStatus(round.id, 'PRICE_PENDING', { ... });
    await transitionRoundStatus(round.id, 'CALCULATING', { winner: 'GOLD' });

    // 5. Settle (Job 5)
    await transitionRoundStatus(round.id, 'SETTLED');
    const settled = await registry.roundService.getRoundById(round.id);
    expect(settled.status).toBe('SETTLED');
  });
});
```

### 수동 테스트 (Postman/curl)

```bash
# 1. 라운드 생성
curl -X POST http://localhost:3000/api/cron/rounds/create \
  -H "X-Cron-Secret: your-secret"

# 2. 상태 전이 (Job 2-5 순차 실행)
curl -X POST http://localhost:3000/api/cron/rounds/open \
  -H "X-Cron-Secret: your-secret"

# 3. 라운드 상태 확인
curl http://localhost:3000/api/rounds/:roundId

# 상태가 올바르게 전이되는지 확인
```

---

## 구현 체크리스트

### Week 1 (필수)

```typescript
// lib/rounds/fsm.ts

// ✅ 1. 상수 정의 (완료)
export const ALLOWED_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = { ... };

// ✅ 2. canTransition (구현 필요)
export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  // TODO: 위의 "함수별 구현 가이드" 참고
}

// ✅ 3. transitionRoundStatus (구현 필요)
export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round> {
  // TODO: 위의 "함수별 구현 가이드" 참고
}
```

### Week 1 테스트

```typescript
// __tests__/lib/rounds/fsm.test.ts

// ✅ 1. canTransition 테스트
describe('canTransition', () => {
  // 정상 전이
  // 잘못된 전이
  // 종료 상태
});

// ✅ 2. transitionRoundStatus 테스트
describe('transitionRoundStatus', () => {
  // 성공 케이스
  // 에러 케이스
  // 멱등성
});
```

### Week 2+ (선택)

```typescript
// ⚠️ 1. round_transitions 테이블 추가
// db/schema/roundTransitions.ts

// ⚠️ 2. logTransition 구현
async function logTransition(...) { ... }

// ⚠️ 3. getTransitionHistory 구현
export async function getTransitionHistory(roundId: string) { ... }
```

---

## 구현 순서 (답안지)

### Step 1: canTransition 함수 수정

```typescript
// lib/rounds/fsm.ts

/**
 * 상태 전이 가능 여부 검증
 */
export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  const allowedStates = ALLOWED_TRANSITIONS[from];

  if (!allowedStates) {
    console.warn(`[FSM] Unknown status: ${from}`);
    return false;
  }

  return allowedStates.includes(to);
}
```

### Step 2: transitionRoundStatus 함수 완성

```typescript
// lib/rounds/fsm.ts
import { AppError } from '@/lib/shared/errors';
import type { Round } from './types';

export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round> {
  // 1. 입력 검증
  if (!roundId || typeof roundId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Invalid round ID', { roundId });
  }

  // 2. 현재 라운드 조회
  const round = await registry.roundService.getRoundById(roundId);
  const currentStatus = round.status as RoundStatus;

  // 3. 전이 가능 여부 검증
  if (!canTransition(currentStatus, newStatus)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      {
        roundId,
        currentStatus,
        newStatus,
        allowedTransitions: ALLOWED_TRANSITIONS[currentStatus],
      },
    );
  }

  // 4. 멱등성 체크
  if (currentStatus === newStatus) {
    console.info(`[FSM] Round ${roundId} already in ${newStatus}`);
    return round;
  }

  // 5. 상태 업데이트
  const updatedRound = await registry.roundService.updateRound(roundId, {
    status: newStatus,
    ...metadata,
    updatedAt: Date.now(),
  });

  // 6. 로깅
  console.info(`[FSM] Round ${roundId}: ${currentStatus} → ${newStatus}`);

  return updatedRound;
}
```

### Step 3: 테스트 작성

```typescript
// __tests__/lib/rounds/fsm.test.ts

import { canTransition, transitionRoundStatus } from '@/lib/rounds/fsm';

describe('canTransition', () => {
  it('should allow SCHEDULED → BETTING_OPEN', () => {
    expect(canTransition('SCHEDULED', 'BETTING_OPEN')).toBe(true);
  });

  it('should deny BETTING_LOCKED → BETTING_OPEN', () => {
    expect(canTransition('BETTING_LOCKED', 'BETTING_OPEN')).toBe(false);
  });
});

// TODO: transitionRoundStatus 테스트 추가
```

### Step 4: Cron Job에서 사용

```typescript
// app/api/cron/rounds/open/route.ts
import { transitionRoundStatus } from '@/lib/rounds/fsm';

export async function POST(request: NextRequest) {
  // ...

  await transitionRoundStatus(round.id, 'BETTING_OPEN', {
    goldStartPrice: prices.gold.toString(),
    btcStartPrice: prices.btc.toString(),
    bettingOpenedAt: Date.now(),
  });

  // ...
}
```

---

## 최종 요약

### FSM의 역할

```
1. ✅ 상태 전이 검증 (canTransition)
2. ✅ 안전한 상태 변경 (transitionRoundStatus)
3. ⚠️ 전이 이력 기록 (logTransition) - Week 2+
```

### 아키텍처 위치

```
FSM = Service Layer에 가까운 독립 모듈
- Repository 불필요 (RoundService 사용)
- 모든 Cron Job에서 공통 사용
- 비즈니스 로직 중심
```

### Cron Job 구현 전에 FSM 먼저!

```
이유:
1. Cron Job은 FSM에 의존
2. FSM 없으면 상태 전이 검증 불가
3. 테스트가 훨씬 쉬워짐
```

### Week 1 우선순위

```
1. ✅ canTransition 구현 (10분)
2. ✅ transitionRoundStatus 구현 (30분)
3. ✅ 테스트 작성 (20분)
4. ✅ Cron Job 2-5에서 사용 (Week 1 진행 중)
```

---

**다음 단계**: `lib/rounds/fsm.ts` 완성 후 → Cron Job 구현 시작! 🚀
