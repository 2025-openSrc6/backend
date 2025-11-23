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

// 2. ✅ 전이 가능 여부 검증 (완료)
export function canTransition(from: RoundStatus, to: RoundStatus): boolean;

// 3. ⚠️ 상태 전이 실행 (구체화 필요)
export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round>;
```

### 지원 레이어 구현 (Week 1)

```typescript
// lib/rounds/service.ts
export class RoundService {
  // ⚠️ 구현 필요
  async updateRoundById(roundId: string, updateData: Partial<Round>): Promise<Round>;
}

// lib/rounds/repository.ts
export class RoundRepository {
  // ⚠️ 구현 필요
  async updateById(id: string, updateData: Partial<Round>): Promise<Round>;
}
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

## 상태 전이별 Metadata 타입 정의

각 상태 전이마다 업데이트해야 하는 필드가 다릅니다. 명확한 타입 정의가 필요합니다.

```typescript
// lib/rounds/types.ts (추가 필요)

/**
 * SCHEDULED → BETTING_OPEN 전이 시 필요한 데이터
 */
export interface OpenRoundMetadata {
  goldStartPrice: string; // 필수
  btcStartPrice: string; // 필수
  priceSnapshotStartAt: number; // Epoch milliseconds, 필수
  startPriceSource: string; // 'kitco' | 'coingecko' | 'average'
  startPriceIsFallback?: boolean; // 기본값: false
  startPriceFallbackReason?: string; // fallback인 경우 사유
  suiPoolAddress: string; // Sui BettingPool Object ID, 필수
  bettingOpenedAt: number; // Epoch milliseconds, 필수
}

/**
 * BETTING_OPEN → BETTING_LOCKED 전이 시 필요한 데이터
 */
export interface LockRoundMetadata {
  bettingLockedAt: number; // Epoch milliseconds, 필수
}

/**
 * BETTING_LOCKED → PRICE_PENDING 전이 시 필요한 데이터
 */
export interface EndRoundMetadata {
  roundEndedAt: number; // Epoch milliseconds, 필수
}

/**
 * PRICE_PENDING → CALCULATING 전이 시 필요한 데이터
 */
export interface CalculateRoundMetadata {
  goldEndPrice: string; // 필수
  btcEndPrice: string; // 필수
  priceSnapshotEndAt: number; // Epoch milliseconds, 필수
  endPriceSource: string; // 'kitco' | 'coingecko' | 'average'
  endPriceIsFallback?: boolean; // 기본값: false
  endPriceFallbackReason?: string; // fallback인 경우 사유
  goldChangePercent: string; // 변동률, 필수
  btcChangePercent: string; // 변동률, 필수
  winner: 'GOLD' | 'BTC' | 'DRAW'; // 필수
}

/**
 * CALCULATING → SETTLED 전이 시 필요한 데이터
 */
export interface SettleRoundMetadata {
  platformFeeCollected: number; // 실제 징수 금액, 필수
  suiSettlementObjectId: string; // Sui Settlement Object ID, 필수
  settlementCompletedAt: number; // Epoch milliseconds, 필수
}

/**
 * CALCULATING → VOIDED 전이 시 필요한 데이터
 */
export interface VoidRoundMetadata {
  settlementCompletedAt: number; // Epoch milliseconds, 필수
  // winner는 이미 'DRAW'로 설정되어 있어야 함
}

/**
 * ANY → CANCELLED 전이 시 필요한 데이터
 */
export interface CancelRoundMetadata {
  // 현재 스키마에는 취소 사유 필드가 없음
  // Week 2+에서 추가 예정
  // cancellationReason?: string;
  // cancelledBy?: string;
  // cancelledAt: number;
}

/**
 * 모든 전이에서 사용 가능한 metadata 타입
 */
export type TransitionMetadata =
  | OpenRoundMetadata
  | LockRoundMetadata
  | EndRoundMetadata
  | CalculateRoundMetadata
  | SettleRoundMetadata
  | VoidRoundMetadata
  | CancelRoundMetadata;
```

### 각 전이별 필수 필드 요약

| 전이                            | 필수 필드                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| SCHEDULED → BETTING_OPEN        | goldStartPrice, btcStartPrice, priceSnapshotStartAt, startPriceSource, suiPoolAddress, bettingOpenedAt               |
| BETTING_OPEN → BETTING_LOCKED   | bettingLockedAt                                                                                                       |
| BETTING_LOCKED → PRICE_PENDING  | roundEndedAt                                                                                                          |
| PRICE_PENDING → CALCULATING     | goldEndPrice, btcEndPrice, priceSnapshotEndAt, endPriceSource, goldChangePercent, btcChangePercent, winner           |
| CALCULATING → SETTLED           | platformFeeCollected, suiSettlementObjectId, settlementCompletedAt                                                    |
| CALCULATING → VOIDED            | settlementCompletedAt (winner는 이미 'DRAW')                                                                          |
| ANY → CANCELLED                 | (없음, Week 2+에서 추가)                                                                                              |

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

### Repository 구현 필요

FSM은 Service를 통해 Repository를 사용합니다. 현재 **Repository에 updateById 메서드가 없으므로 구현이 필요합니다.**

```typescript
// lib/rounds/repository.ts

export class RoundRepository {
  /**
   * 라운드 업데이트 (ID 기준)
   *
   * @param id - 라운드 UUID
   * @param updateData - 업데이트할 데이터 (Partial<Round>)
   * @returns 업데이트된 라운드
   *
   * @throws {Error} 라운드가 존재하지 않을 때
   */
  async updateById(id: string, updateData: Partial<Round>): Promise<Round> {
    const db = getDb();

    // 1. 업데이트 실행
    const result = await db
      .update(rounds)
      .set(updateData)
      .where(eq(rounds.id, id))
      .returning();

    // 2. 결과 확인
    if (!result || result.length === 0) {
      throw new Error(`Round not found: ${id}`);
    }

    return result[0];
  }
}
```

### Service 구현 완료 확인

현재 Service에는 `updateRoundById` 메서드가 있습니다:

```typescript
// lib/rounds/service.ts (현재 구현)

export class RoundService {
  async updateRoundById(roundId: string, updateData: Partial<Round>): Promise<Round> {
    return await this.repository.updateById(roundId, updateData);
  }
}
```

**문제점**: Repository의 `updateById`가 없으므로 에러 발생!

**해결책**: Repository에 `updateById` 메서드 추가 필요 (위 코드 참고)

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
import { ValidationError, BusinessRuleError } from '@/lib/shared/errors';
import { isValidUUID } from '@/lib/shared/uuid';

/**
 * 라운드 상태 전이 (핵심 함수)
 *
 * 보장 사항:
 * - 허용된 전이만 실행
 * - metadata 필수 필드 검증
 * - updated_at 자동 갱신
 * - 멱등성 보장
 *
 * @param roundId 라운드 ID
 * @param newStatus 새로운 상태
 * @param metadata 추가 업데이트 데이터 (각 전이별로 필수 필드 다름)
 * @returns 업데이트된 라운드
 *
 * @throws {ValidationError} roundId가 유효하지 않을 때
 * @throws {NotFoundError} 라운드를 찾을 수 없을 때 (Service에서 발생)
 * @throws {BusinessRuleError} 전이가 허용되지 않을 때
 */
export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round> {
  // 1. 입력 검증
  if (!isValidUUID(roundId)) {
    throw new ValidationError('Invalid UUID format', { roundId });
  }

  // 2. 현재 라운드 조회 (NotFoundError는 Service에서 발생)
  const round = await registry.roundService.getRoundById(roundId);
  const currentStatus = round.status as RoundStatus;

  // 3. 전이 가능 여부 검증
  if (!canTransition(currentStatus, newStatus)) {
    throw new BusinessRuleError(
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

  // 5. 각 전이별 필수 필드 검증 (선택적 구현)
  validateTransitionMetadata(currentStatus, newStatus, metadata);

  // 6. 상태 업데이트 (RoundService 사용)
  const updatedRound = await registry.roundService.updateRoundById(roundId, {
    status: newStatus,
    ...metadata,
    updatedAt: Date.now(),
  });

  // 7. 로깅
  console.info(`[FSM] Round ${roundId}: ${currentStatus} → ${newStatus}`);

  // 8. (선택) 전이 이력 기록
  // Week 2+에서 구현
  // await logTransition(roundId, currentStatus, newStatus, 'CRON_JOB', metadata);

  return updatedRound;
}

/**
 * 전이별 필수 필드 검증 (선택적 구현)
 *
 * @private
 */
function validateTransitionMetadata(
  from: RoundStatus,
  to: RoundStatus,
  metadata?: Record<string, unknown>,
): void {
  if (!metadata) {
    // metadata가 없으면 검증 스킵 (Cron Job에서 필수 필드 제공 책임)
    return;
  }

  // 각 전이별 필수 필드 검증
  const transition = `${from}_${to}`;

  switch (transition) {
    case 'SCHEDULED_BETTING_OPEN':
      validateRequired(metadata, [
        'goldStartPrice',
        'btcStartPrice',
        'priceSnapshotStartAt',
        'startPriceSource',
        'suiPoolAddress',
        'bettingOpenedAt',
      ]);
      break;

    case 'BETTING_OPEN_BETTING_LOCKED':
      validateRequired(metadata, ['bettingLockedAt']);
      break;

    case 'BETTING_LOCKED_PRICE_PENDING':
      validateRequired(metadata, ['roundEndedAt']);
      break;

    case 'PRICE_PENDING_CALCULATING':
      validateRequired(metadata, [
        'goldEndPrice',
        'btcEndPrice',
        'priceSnapshotEndAt',
        'endPriceSource',
        'goldChangePercent',
        'btcChangePercent',
        'winner',
      ]);
      break;

    case 'CALCULATING_SETTLED':
      validateRequired(metadata, [
        'platformFeeCollected',
        'suiSettlementObjectId',
        'settlementCompletedAt',
      ]);
      break;

    case 'CALCULATING_VOIDED':
      validateRequired(metadata, ['settlementCompletedAt']);
      break;

    // CANCELLED는 필수 필드 없음
    default:
      break;
  }
}

/**
 * 필수 필드 검증 헬퍼
 *
 * @private
 */
function validateRequired(metadata: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter((field) => metadata[field] === undefined || metadata[field] === null);

  if (missing.length > 0) {
    throw new ValidationError('Missing required metadata fields', {
      missing,
      provided: Object.keys(metadata),
    });
  }
}
```

**핵심 포인트**:

1. **검증 순서**:

   ```
   입력 검증 → 라운드 조회 → 전이 가능 여부 → 멱등성 체크 → 필수 필드 검증 → 업데이트
   ```

2. **에러 처리** (실제 errors.ts 기준):
   - `ValidationError`: roundId 형식 오류 또는 필수 필드 누락
   - `NotFoundError`: 라운드 없음 (RoundService.getRoundById에서 발생)
   - `BusinessRuleError`: 전이 불가능 (INVALID_TRANSITION 코드)

3. **멱등성**:

   ```typescript
   // 같은 상태로 전이 시도 = 무시 (에러 아님!)
   if (currentStatus === newStatus) {
     console.info(`[FSM] Round ${roundId} already in ${newStatus}, skipping transition`);
     return round;
   }
   ```

4. **RoundService 의존**:
   - `getRoundById()`: 조회 (NotFoundError 발생 가능)
   - `updateRoundById()`: 업데이트 (Repository.updateById 호출)
   - FSM은 DB를 직접 접근하지 않음

5. **필수 필드 검증**:
   - `validateTransitionMetadata()`: 각 전이별 필수 필드 검증
   - 누락 시 `ValidationError` 발생
   - Cron Job에서 올바른 metadata를 제공해야 함

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

**Job 2: Round Opener (상세 예시)**:

```typescript
// app/api/cron/rounds/open/route.ts
import { transitionRoundStatus } from '@/lib/rounds/fsm';
import { getPrices } from '@/lib/prices/fetcher';
import { createSuiBettingPool } from '@/lib/sui/betting-pool';
import type { OpenRoundMetadata } from '@/lib/rounds/types';

export async function POST(request: NextRequest) {
  try {
    // 1. SCHEDULED 라운드 찾기
    const scheduledRounds = await registry.roundService.getRounds({
      statuses: ['SCHEDULED'],
      page: 1,
      pageSize: 100,
    });

    for (const round of scheduledRounds.rounds) {
      // 2. 시작 시각 확인 (지금이 시작 시각인지)
      const now = Date.now();
      if (now < round.startTime) {
        continue; // 아직 시작 안 됨
      }

      try {
        // 3. Start Price 조회
        const priceResult = await getPrices();

        // 4. Sui BettingPool 생성
        const suiPoolAddress = await createSuiBettingPool(round.id);

        // 5. FSM을 통한 상태 전이 ✅
        // OpenRoundMetadata 타입에 맞게 데이터 준비
        const metadata: OpenRoundMetadata = {
          goldStartPrice: priceResult.gold.price.toString(),
          btcStartPrice: priceResult.btc.price.toString(),
          priceSnapshotStartAt: priceResult.timestamp,
          startPriceSource: priceResult.source, // 'kitco' | 'coingecko' | 'average'
          startPriceIsFallback: priceResult.isFallback ?? false,
          startPriceFallbackReason: priceResult.fallbackReason,
          suiPoolAddress,
          bettingOpenedAt: Date.now(),
        };

        await transitionRoundStatus(round.id, 'BETTING_OPEN', metadata);

        console.log(`[Job 2] Round ${round.id} opened successfully`);
      } catch (error) {
        console.error(`[Job 2] Failed to open round ${round.id}:`, error);
        // 개별 라운드 실패해도 계속 진행
      }
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Job 3: Betting Locker (예시)**:

```typescript
// app/api/cron/rounds/lock/route.ts
import { transitionRoundStatus } from '@/lib/rounds/fsm';
import type { LockRoundMetadata } from '@/lib/rounds/types';

export async function POST(request: NextRequest) {
  try {
    // 1. BETTING_OPEN 라운드 찾기
    const openRounds = await registry.roundService.getRounds({
      statuses: ['BETTING_OPEN'],
      page: 1,
      pageSize: 100,
    });

    const now = Date.now();

    for (const round of openRounds.rounds) {
      // 2. 베팅 마감 시각 확인
      if (now < round.lockTime) {
        continue; // 아직 마감 안 됨
      }

      try {
        // 3. FSM을 통한 상태 전이 ✅
        const metadata: LockRoundMetadata = {
          bettingLockedAt: now,
        };

        await transitionRoundStatus(round.id, 'BETTING_LOCKED', metadata);

        console.log(`[Job 3] Round ${round.id} locked`);
      } catch (error) {
        console.error(`[Job 3] Failed to lock round ${round.id}:`, error);
      }
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

### Week 1 필수 구현

#### 1. Types 추가 (lib/rounds/types.ts)

```typescript
// ⚠️ 각 전이별 metadata 타입 추가
export interface OpenRoundMetadata { ... }
export interface LockRoundMetadata { ... }
export interface EndRoundMetadata { ... }
export interface CalculateRoundMetadata { ... }
export interface SettleRoundMetadata { ... }
export interface VoidRoundMetadata { ... }
export interface CancelRoundMetadata { ... }

export type TransitionMetadata =
  | OpenRoundMetadata
  | LockRoundMetadata
  | EndRoundMetadata
  | CalculateRoundMetadata
  | SettleRoundMetadata
  | VoidRoundMetadata
  | CancelRoundMetadata;
```

#### 2. Repository 업데이트 (lib/rounds/repository.ts)

```typescript
// ⚠️ updateById 메서드 추가 (현재 없음!)
export class RoundRepository {
  async updateById(id: string, updateData: Partial<Round>): Promise<Round> {
    // 구현 필요 (위의 "Repository 구현 필요" 섹션 참고)
  }
}
```

#### 3. FSM 완성 (lib/rounds/fsm.ts)

```typescript
// ✅ 1. 상수 정의 (완료)
export const ALLOWED_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = { ... };

// ✅ 2. canTransition (완료)
export function canTransition(from: RoundStatus, to: RoundStatus): boolean { ... }

// ⚠️ 3. transitionRoundStatus (구체화 필요)
// - 에러 타입 수정: AppError → ValidationError, BusinessRuleError
// - validateTransitionMetadata 함수 추가
// - validateRequired 헬퍼 함수 추가
export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round> {
  // TODO: 위의 "transitionRoundStatus 완성된 구현" 참고
}
```

### Week 1 테스트

```typescript
// __tests__/lib/rounds/fsm.test.ts

describe('FSM Tests', () => {
  // ✅ 1. canTransition 테스트
  describe('canTransition', () => {
    it('should allow valid transitions', () => { ... });
    it('should deny invalid transitions', () => { ... });
    it('should deny transitions from terminal states', () => { ... });
  });

  // ⚠️ 2. transitionRoundStatus 테스트
  describe('transitionRoundStatus', () => {
    it('should transition successfully with valid metadata', () => { ... });
    it('should throw ValidationError for invalid UUID', () => { ... });
    it('should throw NotFoundError for non-existent round', () => { ... });
    it('should throw BusinessRuleError for invalid transition', () => { ... });
    it('should throw ValidationError for missing required fields', () => { ... });
    it('should be idempotent (same state)', () => { ... });
  });

  // ⚠️ 3. validateTransitionMetadata 테스트 (선택적)
  describe('validateTransitionMetadata', () => {
    it('should validate SCHEDULED → BETTING_OPEN metadata', () => { ... });
    it('should throw ValidationError for missing required fields', () => { ... });
  });
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

### FSM 구현의 핵심 변경 사항

```
1. ✅ 에러 타입: AppError → ValidationError, BusinessRuleError, NotFoundError
2. ✅ Repository: updateById 메서드 추가 필요 (현재 없음)
3. ✅ Types: 각 전이별 metadata 타입 추가 필요
4. ✅ 필수 필드 검증: validateTransitionMetadata 함수 추가
5. ✅ Service: updateRoundById는 이미 구현됨 (Repository.updateById 호출)
```

### 구현 순서 (우선순위)

```
1. ⚠️ Repository.updateById 구현 (20분) - 가장 급함!
2. ⚠️ types.ts에 metadata 타입 추가 (15분)
3. ⚠️ fsm.ts의 transitionRoundStatus 구체화 (30분)
   - 에러 타입 수정
   - validateTransitionMetadata 함수 추가
   - validateRequired 헬퍼 함수 추가
4. ⚠️ 테스트 작성 (30분)
5. ✅ Cron Job에서 FSM 사용 (Week 1 진행 중)
```

### 아키텍처 레이어 역할

```
FSM (lib/rounds/fsm.ts)
├── 검증: 상태 전이 가능 여부 + 필수 필드
├── 호출: RoundService.getRoundById, updateRoundById
└── 에러: ValidationError, BusinessRuleError

RoundService (lib/rounds/service.ts)
├── 비즈니스 로직: 입력 검증, 계산
├── 호출: RoundRepository 메서드들
└── 에러: NotFoundError (라운드 없을 때)

RoundRepository (lib/rounds/repository.ts)
├── DB 접근: Drizzle ORM 쿼리 생성
├── updateById: ⚠️ 구현 필요!
└── 에러: 기본 Error (DB 오류)
```

### Cron Job 구현 전에 FSM 먼저!

```
이유:
1. Cron Job은 FSM에 의존 (모든 상태 전이는 FSM을 통해)
2. FSM 없으면 상태 전이 검증 불가
3. 각 전이별 필수 필드가 명확해짐
4. 테스트가 훨씬 쉬워짐
```

### 현재 가장 시급한 작업

```
⚠️ Repository.updateById 구현!
   - 현재 Service에서 호출하는데 메서드가 없음
   - FSM이 Service를 통해 DB를 업데이트해야 함
   - 구현 없으면 에러 발생
```

---

**다음 단계**:
1. `lib/rounds/repository.ts`에 `updateById` 메서드 추가
2. `lib/rounds/types.ts`에 metadata 타입 추가
3. `lib/rounds/fsm.ts` 완성
4. Cron Job 구현 시작! 🚀
