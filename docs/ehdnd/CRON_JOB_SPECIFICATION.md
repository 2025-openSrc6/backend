# CRON_JOB_SPECIFICATION.md

deltaX 베팅 시스템의 Cron Job 완전 명세

---

## 📋 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [인증 및 보안](#인증-및-보안)
4. [Job 1: Round Creator](#job-1-round-creator)
5. [Job 2: Round Opener](#job-2-round-opener)
6. [Job 3: Betting Locker](#job-3-betting-locker)
7. [Job 4: Round Finalizer](#job-4-round-finalizer)
8. [Job 5: Settlement Processor](#job-5-settlement-processor)
9. [Job 6: Recovery & Monitoring](#job-6-recovery--monitoring)
10. [Cloudflare Workers Cron 설정](#cloudflare-workers-cron-설정)
11. [에러 처리 및 재시도](#에러-처리-및-재시도)
12. [모니터링 및 알림](#모니터링-및-알림)
13. [로컬 개발 환경](#로컬-개발-환경)
14. [테스트 전략](#테스트-전략)

---

## 개요

### Cron Job의 역할

deltaX의 6시간 라운드는 **완전 자동화**됩니다.
Cron Job은 라운드의 전체 생명주기를 관리합니다:

```
라운드 생성 (T-10분)
  ↓
라운드 시작 (T+0)
  ↓
베팅 마감 (T+1분)
  ↓
진행 (5시간 59분 대기)
  ↓
라운드 종료 (T+6시간)
  ↓
정산 처리 (자동)
  ↓
완료
```

### 핵심 설계 원칙 (2025-11-25)

#### 1. 단일 라운드 처리

각 Job은 **"가장 최근 라운드 1개"**만 처리합니다.

```
❌ 잘못된 접근: findAllScheduledRounds() → 모든 SCHEDULED 라운드 처리
✅ 올바른 접근: findLatestScheduledRound() → 가장 최근 1개만 처리
```

**이유:**

- 정상 상황에서는 항상 1개만 해당
- 코드 단순화 및 예측 가능한 동작
- 비정상 라운드는 CANCEL 처리 (복구 시도 안 함)

#### 2. 복구 전략 분리

| 범주           | Job       | 실패 시             | 이유               |
| -------------- | --------- | ------------------- | ------------------ |
| **돈 안 걸림** | Job 1,2,3 | CANCEL + 알림       | 복구해도 의미 없음 |
| **돈 걸림**    | Job 4,5   | Recovery에서 재시도 | 반드시 완료해야 함 |

**Job 1,2,3 실패 시:**

- 해당 라운드 CANCEL
- Slack 알림
- 다음 6시간 후 라운드로 진행

**Job 4,5 실패 시:**

- CALCULATING 상태 유지
- Recovery Job (Job 6)에서 재시도
- 3회 실패 시 수동 개입 알림

#### 3. 시간 제약 검증

각 Job은 **시간 조건을 반드시 확인**합니다:

| Job | 조건                          | 실패 시         |
| --- | ----------------------------- | --------------- |
| 2   | `startTime <= NOW < lockTime` | CANCEL          |
| 3   | `lockTime <= NOW`             | 상태 전이       |
| 4   | `endTime <= NOW`              | Recovery 재시도 |

### Job 개수 및 실행 주기

| Job | 이름                  | 실행 주기  | 실행 시각 (KST)            |
| --- | --------------------- | ---------- | -------------------------- |
| 1   | Round Creator         | 매일 4회   | 01:50, 07:50, 13:50, 19:50 |
| 2   | Round Opener          | 매일 4회   | 02:00, 08:00, 14:00, 20:00 |
| 3   | Betting Locker        | 매일 4회   | 02:01, 08:01, 14:01, 20:01 |
| 4   | Round Finalizer       | 매일 4회   | 02:00, 08:00, 14:00, 20:00 |
| 5   | Settlement Processor  | 이벤트기반 | (Job 4 완료 후 즉시)       |
| 6   | Recovery & Monitoring | 매분       | 매 분마다                  |

**참고**: Job 2와 Job 4는 같은 시각에 실행되지만, **Job 4가 먼저 실행**됩니다.

- Job 4: BETTING_LOCKED → CALCULATING (이전 라운드 종료) - **먼저 실행**
- Job 2: SCHEDULED → BETTING_OPEN (새 라운드 시작) - **이후 실행**

> 💡 **의사결정**: 이전 라운드 정산(돈이 걸림)이 새 라운드 시작보다 중요하므로 Job 4 우선 실행.
> 자세한 내용은 `CRON_DECISIONS.md` 참조.

---

## 아키텍처

### 폴더 구조

```
app/api/cron/
├── rounds/
│   ├── create/
│   │   └── route.ts          # Job 1
│   ├── open/
│   │   └── route.ts          # Job 2
│   ├── lock/
│   │   └── route.ts          # Job 3
│   ├── finalize/
│   │   └── route.ts          # Job 4
│   └── settle/
│       └── route.ts          # Job 5
└── recovery/
    └── route.ts              # Job 6

lib/cron/
├── auth.ts                   # Cron Secret 검증 미들웨어
├── logger.ts                 # Cron Job 전용 로거
└── slack.ts                  # Slack 알림

lib/rounds/
├── fsm.ts                    # 상태 전이 로직 (핵심!)
├── calculator.ts             # 배당 계산 로직
└── recovery.ts               # 복구 로직
```

### 의존성 다이어그램

```
Cloudflare Workers Cron
    ↓
app/api/cron/rounds/*/route.ts
    ↓
lib/cron/auth.ts (인증)
    ↓
registry.roundService (Service Layer)
    ↓
lib/rounds/fsm.ts (상태 전이)
    ↓
Drizzle ORM (D1 Database)
    ↓
lib/sui/client.ts (Sui Blockchain)
    ↓
WebSocket (실시간 알림)
```

### 데이터 흐름

```
[Cron Trigger]
    ↓
[인증 검증] (X-Cron-Secret)
    ↓
[라운드 조회] (D1)
    ↓
[상태 전이 검증] (FSM)
    ↓
[비즈니스 로직 실행]
    ├─ 가격 조회 (Job 2, 4)
    ├─ Sui 호출 (Job 2, 4, 5)
    └─ 배당 계산 (Job 4, 5)
    ↓
[DB 업데이트] (트랜잭션)
    ↓
[WebSocket 발행]
    ↓
[응답 반환]
```

---

## 인증 및 보안

### Cron Secret 인증

**환경 변수 설정**:

```bash
# .env.local
CRON_SECRET=your-secret-key-here-min-32-chars
```

**검증 미들웨어** (`lib/cron/auth.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron Secret 검증 미들웨어
 *
 * 사용법:
 *   export async function POST(request: NextRequest) {
 *     const authResult = await verifyCronAuth(request);
 *     if (!authResult.success) return authResult.response;
 *
 *     // 실제 로직...
 *   }
 */
export async function verifyCronAuth(request: NextRequest): Promise<{
  success: boolean;
  response?: NextResponse;
}> {
  const secret = request.headers.get('X-Cron-Secret');
  const expectedSecret = process.env.CRON_SECRET;

  // 환경 변수 확인
  if (!expectedSecret) {
    console.error('[CRON] CRON_SECRET not configured');
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Cron secret not configured',
          },
        },
        { status: 500 },
      ),
    };
  }

  // Secret 검증
  if (secret !== expectedSecret) {
    console.warn('[CRON] Invalid cron secret attempt');
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid cron secret',
          },
        },
        { status: 401 },
      ),
    };
  }

  return { success: true };
}
```

### Cloudflare Workers Cron 설정

**wrangler.toml**:

```toml
[triggers]
crons = [
  # Job 1: Round Creator (T-10분)
  "50 16,22,4,10 * * *",  # 01:50, 07:50, 13:50, 19:50 KST

  # Job 2: Round Opener (T+0)
  "0 17,23,5,11 * * *",   # 02:00, 08:00, 14:00, 20:00 KST

  # Job 3: Betting Locker (T+1분)
  "1 17,23,5,11 * * *",   # 02:01, 08:01, 14:01, 20:01 KST

  # Job 4: Round Finalizer (T+6시간, Job 2와 동일)
  "0 17,23,5,11 * * *",   # 02:00, 08:00, 14:00, 20:00 KST

  # Job 6: Recovery (매분)
  "* * * * *"
]
```

**Cloudflare Cron Handler** (Next.js on Cloudflare):

```typescript
// app/api/cron/scheduled/route.ts
```

---

## Job 1: Round Creator

### 목적

다음 라운드를 미리 생성 (T-10분)

### 실행 시각

- **KST**: 01:50, 07:50, 13:50, 19:50
- **UTC**: 16:50, 22:50, 04:50, 10:50

### 구현 (`app/api/cron/rounds/create/route.ts`)

실제 코드는 해당 파일에서 참고

### Service Layer (`lib/rounds/round.service.ts`)

### 재시도 전략

없음. job1 실패 시 CANCEL로 추후 진행 예정.

---

## Job 2: Round Opener

### 목적

라운드 시작 및 베팅 활성화 (T+0)

### 실행 시각

- **KST**: 02:00, 08:00, 14:00, 20:00
- **UTC**: 17:00, 23:00, 05:00, 11:00

### 핵심 작업

1. **가장 최근 SCHEDULED 라운드 1개 찾기**
2. **시간 조건 확인** (`startTime <= NOW < lockTime`)
3. **Start Price 스냅샷** (현준님 API 호출)
4. **상태 전이**: `SCHEDULED → BETTING_OPEN`
5. **실패 시 CANCEL** (복구 안 함)

### 설계 의사결정

> **Q: 왜 "모든 SCHEDULED 라운드"가 아닌 "가장 최근 1개"만 처리하나요?**
>
> A: 정상 상황에서는 항상 1개만 해당합니다.
> 만약 여러 개가 있다면 이전 Job이 실패한 것이고,
> 이미 startTime이 지난 라운드는 복구해도 의미 없습니다 (lockTime도 지났을 것).
> 그냥 CANCEL하고 다음 라운드로 진행하는 것이 단순하고 안전합니다.

### 구현

### Service Layer 메서드 (조회용)

```typescript
// lib/rounds/service.ts

/**
 * 가장 최근 SCHEDULED 라운드 1개 찾기
 *
 * 왜 "모든 SCHEDULED"가 아닌 "가장 최근 1개"인가?
 * - 정상 상황: 항상 1개만 존재
 * - 비정상 상황: 이전 라운드가 밀려있으면 CANCEL 대상
 */
async findLatestScheduledRound(): Promise<Round | null> {
  return this.repository.findLatestByStatus('SCHEDULED');
}

/**
 * 라운드 취소 (FSM 래핑)
 *
 * 취소는 여러 곳에서 호출되므로 Service에서 래핑
 */
async cancelRound(
  roundId: string,
  params: {
    reason: string;
    message: string;
    cancelledBy: 'SYSTEM' | 'ADMIN';
  }
): Promise<Round> {
  const { transitionRoundStatus } = await import('./fsm');

  return transitionRoundStatus(roundId, 'CANCELLED', {
    cancellationReason: params.reason,
    cancellationMessage: params.message,
    cancelledBy: params.cancelledBy,
    cancelledAt: Date.now(),
  });
}
```

### 가격 API 실패 시

> **설계 변경**: Fallback/Retry 로직을 Job 2에서 직접 구현하지 않습니다.
> 가격 API (현준님 구현)에서 내부적으로 처리하고, 최종 실패 시 에러를 throw합니다.
> Job 2는 에러 받으면 그냥 실패 처리 + 알림합니다.

```typescript
// lib/prices/fetcher.ts (현준님 구현)

/**
 * 가격 조회 (내부 Fallback 포함)
 *
 * 호출자는 이 함수만 호출하면 됨.
 * 실패 시 에러 throw → 호출자가 처리
 */
export async function getPrices(): Promise<PriceData> {
  // 현준님이 내부적으로:
  // 1. 실시간 API 시도
  // 2. 실패 시 캐시 사용
  // 3. 최종 실패 시 throw
}
```

---

## Job 3: Betting Locker

### 목적

베팅 마감 (T+1분)

### 실행 시각

- **KST**: 02:01, 08:01, 14:01, 20:01
- **UTC**: 17:01, 23:01, 05:01, 11:01

### 핵심 작업

1. **가장 최근 BETTING_OPEN 라운드 1개 찾기**
2. **시간 조건 확인** (`lockTime <= NOW`)
3. **상태 전이**: `BETTING_OPEN → BETTING_LOCKED`
4. **실패해도 괜찮음** (API에서 lockTime 검사함)

### 설계 의사결정

> **Q: Job 3이 실패하면 어떻게 되나요?**
>
> A: 베팅 API에서 이미 lockTime을 검사하므로 실제로 베팅이 들어오지 않습니다.
> DB 상태만 BETTING_OPEN이지, 실질적으로는 마감된 상태입니다.
> Job 4 (Finalize)에서 자연스럽게 처리되거나, Recovery에서 잡힙니다.
> **별도 복구 로직이 필요 없습니다.**

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { transitionRoundStatus } from '@/lib/rounds/fsm';

/**
 * POST /api/cron/rounds/lock
 *
 * Job 3: Betting Locker
 *
 * 단순 로직:
 * 1. 가장 최근 BETTING_OPEN 라운드 1개 찾기
 * 2. lockTime <= NOW 확인
 * 3. 상태 전이 (BETTING_OPEN → BETTING_LOCKED) - FSM 직접 사용
 * 4. 실패해도 API에서 막고 있으니 치명적이지 않음
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job 3] Betting Locker started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 3] Auth failed');
      return authResult.response;
    }

    // 2. 가장 최근 BETTING_OPEN 라운드 1개 찾기
    const round = await registry.roundService.findLatestOpenRound();

    if (!round) {
      cronLogger.info('[Job 3] No open round found');
      return createSuccessResponse({ message: 'No open round' });
    }

    // 3. 시간 조건 확인 (lockTime이 지났는지)
    const now = Date.now();

    if (round.lockTime > now) {
      cronLogger.info('[Job 3] Round not ready to lock yet', {
        roundId: round.id,
        lockTime: new Date(round.lockTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      return createSuccessResponse({ message: 'Round not ready to lock' });
    }

    // 4. 상태 전이 (BETTING_OPEN → BETTING_LOCKED) - FSM 직접 사용
    await transitionRoundStatus(round.id, 'BETTING_LOCKED', {
      bettingLockedAt: Date.now(), // FSM 필수 필드
    });

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 3] Completed', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      durationMs: jobDuration,
    });

    return createSuccessResponse({
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        status: 'BETTING_LOCKED',
      },
    });
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 3] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    // 실패해도 치명적이지 않음 (API에서 lockTime 검사)
    // Slack 알림은 보내되, 복구는 안 함
    return handleApiError(error);
  }
}
```

### Service Layer 메서드 (조회용)

```typescript
// lib/rounds/service.ts

/**
 * 가장 최근 BETTING_OPEN 라운드 1개 찾기
 */
async findLatestOpenRound(): Promise<Round | null> {
  return this.repository.findLatestByStatus('BETTING_OPEN');
}
```

> **참고**: 상태 전이는 Route에서 `transitionRoundStatus`를 직접 호출합니다.

### 베팅 API의 시간 검증 (이미 구현됨)

Job 3이 실패해도 베팅이 막히는 이유:

```typescript
// POST /api/bets 에서
if (now >= round.lockTime) {
  throw new AppError('BETTING_CLOSED', '베팅 시간이 종료되었습니다');
}
```

---

## Job 4: Round Finalizer

### 목적

라운드 종료 및 승자 판정 (T+6시간)

### 실행 시각

- **KST**: 02:00, 08:00, 14:00, 20:00 (Job 2와 동일, Job 2보다 먼저 실행)
- **UTC**: 17:00, 23:00, 05:00, 11:00

### 핵심 작업

1. **가장 최근 BETTING_LOCKED 라운드 1개 찾기**
2. **시간 조건 확인** (`endTime <= NOW`)
3. **End Price 스냅샷**
4. **승자 판정 + 배당 계산**
5. **상태 전이**: `BETTING_LOCKED → CALCULATING`
6. **Job 5 트리거** (정산 처리)
7. **실패 시 Recovery에서 재시도** (돈이 걸린 Job!)

### 설계 의사결정

> **Q: 왜 Job 4는 실패 시 CANCEL이 아닌 Recovery 재시도인가요?**
>
> A: **돈이 걸려있기 때문입니다.**
> Job 4가 실패하면 베팅한 유저들이 결과를 받지 못합니다.
> CALCULATING 상태로 두고 Recovery Job에서 재시도해야 합니다.

> **Q: PRICE_PENDING 상태가 필요한가요?**
>
> A: 제거합니다. DB 초기화가 가능한 상태이므로 FSM을 단순화해 `BETTING_LOCKED → CALCULATING`으로 직접 전이합니다.

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { getPrices } from '@/lib/prices/fetcher';
import { determineWinner, calculatePayout } from '@/lib/rounds/calculator';
import { sendSlackAlert } from '@/lib/cron/slack';
import { getPlatformFeeRate } from '@/lib/config/cron';
import { transitionRoundStatus } from '@/lib/rounds/fsm';

/**
 * POST /api/cron/rounds/finalize
 *
 * Job 4: Round Finalizer
 *
 * 단순 로직:
 * 1. 가장 최근 BETTING_LOCKED 라운드 1개 찾기
 * 2. endTime <= NOW 확인
 * 3. End Price 스냅샷 가져오기
 * 4. 승자 판정 + 배당 계산 (여기까지 성공해야 전이 시작)
 * 5. 상태 전이 (BETTING_LOCKED → CALCULATING) - 단일 전이
 * 6. Job 5 트리거 (내부 서비스 호출 권장)
 * 7. 실패 시 → Recovery에서 재시도 (돈이 걸린 Job!)
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job 4] Round Finalizer started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 4] Auth failed');
      return authResult.response;
    }

    // 2. 가장 최근 BETTING_LOCKED 라운드 1개 찾기
    const round = await registry.roundService.findLatestLockedRound();

    if (!round) {
      cronLogger.info('[Job 4] No locked round found');
      return createSuccessResponse({ message: 'No locked round' });
    }

    // 3. 시간 조건 확인 (endTime이 지났는지)
    const now = Date.now();

    if (round.endTime > now) {
      cronLogger.info('[Job 4] Round not ready to finalize yet', {
        roundId: round.id,
        endTime: new Date(round.endTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      return createSuccessResponse({ message: 'Round not ready to finalize' });
    }

    // 4. End Price 스냅샷 가져오기
    cronLogger.info('[Job 4] Fetching end prices', { roundId: round.id });

    const prices = await getPrices();

    cronLogger.info('[Job 4] Prices fetched', {
      gold: prices.gold,
      btc: prices.btc,
      source: prices.source,
    });

    // 5. 승자 판정 + 배당 계산 (전이 전에 끝내기)
    const winnerResult = determineWinner({
      goldStart: parseFloat(round.goldStartPrice!),
      goldEnd: prices.gold,
      btcStart: parseFloat(round.btcStartPrice!),
      btcEnd: prices.btc,
    });

    const payoutResult = calculatePayout({
      winner: winnerResult.winner,
      totalPool: round.totalPool,
      totalGoldBets: round.totalGoldBets,
      totalBtcBets: round.totalBtcBets,
      platformFeeRate: getPlatformFeeRate(),
    });

    // 6. 상태 전이 (BETTING_LOCKED → CALCULATING)
    const calculatingRound = await transitionRoundStatus(round.id, 'CALCULATING', {
      roundEndedAt: Date.now(),
      goldEndPrice: prices.gold.toString(),
      btcEndPrice: prices.btc.toString(),
      priceSnapshotEndAt: prices.timestamp,
      endPriceSource: prices.source,
      winner: winnerResult.winner,
      goldChangePercent: winnerResult.goldChangePercent.toString(),
      btcChangePercent: winnerResult.btcChangePercent.toString(),
    });

    // 7. Job 5 트리거 (정산 처리) - 내부 Service 호출 권장, HTTP fetch는 대안
    await registry.roundService.settleRound(calculatingRound.id);

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 4] Completed', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      winner: winnerResult.winner,
      durationMs: jobDuration,
    });

    return createSuccessResponse({
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        status: 'CALCULATING',
        winner: winnerResult.winner,
      },
      payout: payoutResult,
    });
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 4] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    // 실패 시 알림 (Recovery에서 재시도 - 돈이 걸린 Job!)
    await sendSlackAlert({
      level: 'ERROR',
      job: 'Round Finalizer',
      message: '라운드 종료 실패 - Recovery에서 재시도 필요',
      details: { error: error instanceof Error ? error.message : String(error) },
    });

    return handleApiError(error);
  }
}
```

### Service Layer 메서드 (조회용)

```typescript
// lib/rounds/service.ts

/**
 * 가장 최근 BETTING_LOCKED 라운드 1개 찾기
 */
async findLatestLockedRound(): Promise<Round | null> {
  return this.repository.findLatestByStatus('BETTING_LOCKED');
}
```

> **참고**: 상태 전이는 Route에서 `transitionRoundStatus`를 직접 호출합니다.
> FSM 단순화로 BETTING_LOCKED → CALCULATING 단일 전이를 사용합니다.

### 승자 판정 로직 (`lib/rounds/calculator.ts`)

> 💡 **의사결정**: DRAW(무승부) 제거됨. 동률 시 금 승리. 자세한 내용은 `CRON_DECISIONS.md` 참조.

```typescript
/**
 * 승자 판정 결과
 */
export interface WinnerResult {
  winner: 'GOLD' | 'BTC';
  goldChangePercent: number;
  btcChangePercent: number;
}

/**
 * 승자 판정
 *
 * 규칙:
 * - 변동률이 더 높은 자산이 승리
 * - 동률 시 금(GOLD) 승리 (DRAW 없음)
 */
export function determineWinner(params: {
  goldStart: number;
  goldEnd: number;
  btcStart: number;
  btcEnd: number;
}): WinnerResult {
  const { goldStart, goldEnd, btcStart, btcEnd } = params;

  // 변동률 계산 (%)
  const goldChangePercent = ((goldEnd - goldStart) / goldStart) * 100;
  const btcChangePercent = ((btcEnd - btcStart) / btcStart) * 100;

  // 금 변동률 >= 비트 변동률 → 금 승리 (동률 시 금)
  const winner = goldChangePercent >= btcChangePercent ? 'GOLD' : 'BTC';

  return {
    winner,
    goldChangePercent,
    btcChangePercent,
  };
}

/**
 * 배당 계산 결과
 */
export interface PayoutResult {
  platformFee: number;
  payoutPool: number;
  payoutRatio: number;
  winningPool: number;
}

/**
 * 배당 계산
 */
export function calculatePayout(params: {
  winner: 'GOLD' | 'BTC';
  totalPool: number;
  totalGoldBets: number;
  totalBtcBets: number;
  platformFeeRate: number;
}): PayoutResult {
  const { winner, totalPool, totalGoldBets, totalBtcBets, platformFeeRate } = params;

  // 플랫폼 수수료
  const platformFee = Math.floor(totalPool * platformFeeRate);
  const payoutPool = totalPool - platformFee;

  // 승자 풀
  const winningPool = winner === 'GOLD' ? totalGoldBets : totalBtcBets;

  // 배당 비율 (승자 1 DEL당 받는 금액)
  const payoutRatio = winningPool > 0 ? payoutPool / winningPool : 0;

  return {
    platformFee,
    payoutPool,
    payoutRatio,
    winningPool,
  };
}
```

---

## Job 5: Settlement Processor

### 목적

정산 처리 및 배당 지급

### 실행 방식

**이벤트 기반** (Job 4가 트리거) + **Recovery에서 재시도**

**트리거 방법**

- 기본: Job 4에서 내부 Service 메서드(`roundService.settleRound`)를 직접 호출하여 즉시 정산 시작 (Cron secret/HTTP 의존 없음).
- 대안: 동일한 경로(`/api/cron/rounds/settle`)를 `fetch`로 호출. 실패 시 에러를 던져 CALCULATING 상태로 남겨 Recovery가 재시도하도록 한다.
- 라우트는 유지하되 얇게 만든다(인증/파싱 후 Service 호출만). Recovery나 수동 재시도 시 동일 경로를 재사용한다.

### 핵심 작업

1. **CALCULATING 라운드 조회**
2. **승자/패자 베팅 분류**
3. **각 승자에게 배당 계산 + 전송**
4. **패자 상태 업데이트**
5. **상태 전이**: `CALCULATING → SETTLED`
6. **실패 시 Recovery에서 재시도** (돈이 걸린 Job!)

### 설계 의사결정

> **Q: 왜 멱등성이 중요한가요?**
>
> A: Recovery에서 재시도될 수 있기 때문입니다.
> 이미 정산된 베팅은 건너뛰고, 실패한 베팅만 재처리해야 합니다.

> **Q: VOIDED 상태는 언제 사용하나요?**
>
> A: DRAW가 제거되어 정상 플로우에서는 사용하지 않습니다.
> 시스템 오류로 정산 불가 시 수동으로 VOIDED 처리 후 전액 환불합니다.

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { sendSlackAlert } from '@/lib/cron/slack';
import { AppError } from '@/lib/shared/errors';
import { transitionRoundStatus } from '@/lib/rounds/fsm';

/**
 * POST /api/cron/rounds/settle
 *
 * Job 5: Settlement Processor
 *
 * 단순 로직:
 * 1. roundId로 CALCULATING 라운드 조회
 * 2. 승자/패자 베팅 분류
 * 3. 각 승자에게 배당 계산 + DB 업데이트
 * 4. 패자 상태 업데이트
 * 5. 상태 전이 (CALCULATING → SETTLED) - FSM 직접 사용
 * 6. 실패 시 → Recovery에서 재시도 (돈이 걸린 Job!)
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 5] Auth failed');
      return authResult.response;
    }

    // 2. roundId 파싱
    const body = await request.json();
    const { roundId } = body;

    if (!roundId) {
      throw new AppError('INVALID_REQUEST', 'roundId is required');
    }

    cronLogger.info('[Job 5] Settlement Processor started', { roundId });

    // 3. 라운드 조회
    const round = await registry.roundService.findRoundById(roundId);

    if (!round) {
      throw new AppError('ROUND_NOT_FOUND', `Round not found: ${roundId}`);
    }

    if (round.status !== 'CALCULATING') {
      cronLogger.info('[Job 5] Round not in CALCULATING status', {
        roundId,
        currentStatus: round.status,
      });
      return createSuccessResponse({
        message: 'Round not in CALCULATING status',
        roundId,
        currentStatus: round.status,
      });
    }

    // 4. 베팅 조회
    const allBets = await registry.betService.findBetsByRoundId(roundId);

    if (allBets.length === 0) {
      cronLogger.info('[Job 5] No bets to settle', { roundId });

      // 베팅 없으면 바로 SETTLED - FSM 직접 사용
      await transitionRoundStatus(roundId, 'SETTLED', {
        platformFeeCollected: 0,
        settlementCompletedAt: Date.now(),
      });

      return createSuccessResponse({
        round: { id: roundId, status: 'SETTLED' },
        settledBets: 0,
      });
    }

    // 5. 승자/패자 분류
    const winningBets = allBets.filter((bet) => bet.prediction === round.winner);
    const losingBets = allBets.filter((bet) => bet.prediction !== round.winner);

    cronLogger.info('[Job 5] Bets classified', {
      roundId,
      winners: winningBets.length,
      losers: losingBets.length,
    });

    // 6. 승자 풀 계산
    const winningPool = round.winner === 'GOLD' ? round.totalGoldBets : round.totalBtcBets;

    // 7. 각 승자 정산 (멱등성 보장)
    let settledCount = 0;
    let failedCount = 0;

    for (const bet of winningBets) {
      try {
        // 이미 정산된 베팅은 건너뛰기 (멱등성)
        if (bet.settlementStatus === 'COMPLETED') {
          cronLogger.info('[Job 5] Bet already settled, skipping', { betId: bet.id });
          settledCount++;
          continue;
        }

        // 개별 배당 계산
        const userShare = bet.amount / winningPool;
        const payout = Math.floor(userShare * round.payoutPool);

        // DB 업데이트
        await registry.betService.updateBetSettlement(bet.id, {
          settlementStatus: 'COMPLETED',
          resultStatus: 'WON',
          payoutAmount: payout,
          settledAt: Date.now(),
        });

        settledCount++;
      } catch (error) {
        cronLogger.error('[Job 5] Failed to settle winning bet', {
          betId: bet.id,
          error: error instanceof Error ? error.message : String(error),
        });

        await registry.betService.updateBetSettlement(bet.id, {
          settlementStatus: 'FAILED',
        });

        failedCount++;
      }
    }

    // 8. 패자 처리
    for (const bet of losingBets) {
      // 이미 처리된 베팅 건너뛰기
      if (bet.settlementStatus === 'COMPLETED') continue;

      await registry.betService.updateBetSettlement(bet.id, {
        settlementStatus: 'COMPLETED',
        resultStatus: 'LOST',
        payoutAmount: 0,
        settledAt: Date.now(),
      });
    }

    // 9. 라운드 상태 업데이트
    if (failedCount === 0) {
      // 정산 완료 - FSM 직접 사용
      await transitionRoundStatus(roundId, 'SETTLED', {
        platformFeeCollected: round.platformFee || 0,
        settlementCompletedAt: Date.now(),
      });

      const jobDuration = Date.now() - jobStartTime;
      cronLogger.info('[Job 5] Completed', {
        roundId,
        settledCount,
        losersProcessed: losingBets.length,
        durationMs: jobDuration,
      });

      return createSuccessResponse({
        round: { id: roundId, status: 'SETTLED' },
        settledBets: settledCount + losingBets.length,
        payoutsSent: settledCount,
      });
    } else {
      // 일부 실패 → Recovery에서 재시도
      await registry.roundService.incrementRetryCount(roundId);

      const jobDuration = Date.now() - jobStartTime;
      cronLogger.warn('[Job 5] Partially settled', {
        roundId,
        settledCount,
        failedCount,
        durationMs: jobDuration,
      });

      return createSuccessResponse({
        round: { id: roundId, status: 'CALCULATING' },
        settledBets: settledCount,
        failedBets: failedCount,
        message: 'Partially settled, will retry in Recovery',
      });
    }
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 5] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    // 실패 시 알림 (Recovery에서 재시도 - 돈이 걸린 Job!)
    await sendSlackAlert({
      level: 'ERROR',
      job: 'Settlement Processor',
      message: '정산 실패 - Recovery에서 재시도 필요',
      details: { error: error instanceof Error ? error.message : String(error) },
    });

    return handleApiError(error);
  }
}
```

### Service Layer 메서드

> **참고**: 상태 전이는 Route에서 `transitionRoundStatus`를 직접 호출합니다.

```typescript
// lib/rounds/service.ts

/**
 * 정산 재시도 카운트 증가
 */
async incrementRetryCount(roundId: string): Promise<number> {
  const round = await this.getRoundById(roundId);
  const newCount = (round.settlementRetryCount || 0) + 1;

  await this.repository.updateById(roundId, {
    settlementRetryCount: newCount,
    updatedAt: Date.now(),
  });

  return newCount;
}
```

```typescript
// lib/bets/bet.service.ts

/**
 * 베팅 정산 상태 업데이트
 */
async updateBetSettlement(
  betId: string,
  data: {
    settlementStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
    resultStatus?: 'WON' | 'LOST' | 'REFUNDED';
    payoutAmount?: number;
    settledAt?: number;
  }
): Promise<void> {
  await this.repository.updateById(betId, {
    ...data,
    updatedAt: Date.now(),
  });
}
```

---

## Job 6: Recovery & Monitoring

### 목적

**돈이 걸린 Job (Job 4, 5)의 실패를 복구**

### 실행 시각

**매분** (`* * * * *`)

### 핵심 작업

1. **CALCULATING 상태 10분+ 라운드 찾기** (Job 4, 5 실패)
2. **Job 5 재호출** (정산 재시도)
3. **3회 실패 → Slack CRITICAL 알림** (수동 개입 필요)
4. 필요 시 BETTING_LOCKED + endTime 지난 라운드를 Job 4 재호출로 확장 가능 (Job 4 실패 대비)

### 설계 의사결정

> **Q: 왜 Job 1, 2, 3 실패는 Recovery에서 안 잡나요?**
>
> A: 돈이 안 걸린 Job이기 때문입니다.
>
> - Job 1 실패 → 라운드 없음 → 다음 6시간 후 진행
> - Job 2 실패 → SCHEDULED 유지 → 시간 지나면 CANCEL
> - Job 3 실패 → API에서 막고 있음 → Job 4에서 처리
>
> Recovery는 **"이미 베팅이 들어온 라운드의 정산 실패"**만 복구합니다.

> **Q: BETTING_LOCKED 상태가 오래 지속되면요?**
>
> A: Job 4가 실패한 것입니다.
> Recovery에서 BETTING_LOCKED + endTime 지난 라운드도 찾아서 Job 4를 다시 호출할 수 있습니다.
> (Week 2 구현 시 추가)

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { sendSlackAlert } from '@/lib/cron/slack';
import { getRecoveryStuckThresholdMs } from '@/lib/config/cron';

const MAX_RETRY_COUNT = 3;

/**
 * POST /api/cron/recovery
 *
 * Job 6: Recovery & Monitoring
 *
 * 돈이 걸린 Job의 실패를 복구:
 * 1. CALCULATING 상태가 10분+ 지속된 라운드 찾기
 * 2. Job 5 재호출 (정산 재시도)
 * 3. 3회 실패 → Slack CRITICAL 알림
 */
export async function POST(request: NextRequest) {
  const jobStartTime = Date.now();
  cronLogger.info('[Job 6] Recovery started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 6] Auth failed');
      return authResult.response;
    }

    // 2. CALCULATING 상태가 오래 지속된 라운드 찾기
    const stuckRounds = await registry.roundService.findStuckCalculatingRounds();

    if (stuckRounds.length === 0) {
      cronLogger.info('[Job 6] No stuck rounds found');
      return createSuccessResponse({ message: 'No stuck rounds' });
    }

    cronLogger.warn('[Job 6] Found stuck rounds', {
      count: stuckRounds.length,
      roundIds: stuckRounds.map((r) => r.id),
    });

    // 3. 각 라운드 복구 시도
    const results: {
      roundId: string;
      action: 'retried' | 'alerted' | 'skipped';
      retryCount?: number;
    }[] = [];

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    for (const round of stuckRounds) {
      // 3-1. 재시도 횟수 확인
      const retryCount = round.settlementRetryCount || 0;

      if (retryCount >= MAX_RETRY_COUNT) {
        // 3회 이상 실패 → Slack CRITICAL 알림
        cronLogger.error('[Job 6] Max retries exceeded', {
          roundId: round.id,
          retryCount,
        });

        await sendSlackAlert({
          level: 'CRITICAL',
          job: 'Recovery',
          message: `라운드 ${round.roundNumber} 정산 ${retryCount}회 실패, 수동 개입 필요`,
          details: {
            roundId: round.id,
            roundNumber: round.roundNumber,
            retryCount,
            winner: round.winner,
            totalPool: round.totalPool,
          },
        });

        results.push({ roundId: round.id, action: 'alerted', retryCount });
        continue;
      }

      // 3-2. Job 5 재호출
      try {
        cronLogger.info('[Job 6] Retrying settlement', {
          roundId: round.id,
          attempt: retryCount + 1,
        });

        await fetch(`${baseUrl}/api/cron/rounds/settle`, {
          method: 'POST',
          headers: {
            'X-Cron-Secret': process.env.CRON_SECRET!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roundId: round.id }),
        });

        results.push({ roundId: round.id, action: 'retried', retryCount: retryCount + 1 });
      } catch (error) {
        cronLogger.error('[Job 6] Retry failed', {
          roundId: round.id,
          error: error instanceof Error ? error.message : String(error),
        });

        results.push({ roundId: round.id, action: 'skipped' });
      }
    }

    const jobDuration = Date.now() - jobStartTime;
    cronLogger.info('[Job 6] Completed', {
      durationMs: jobDuration,
      results,
    });

    return createSuccessResponse({ results });
  } catch (error) {
    const jobDuration = Date.now() - jobStartTime;
    cronLogger.error('[Job 6] Failed', {
      durationMs: jobDuration,
      error: error instanceof Error ? error.message : String(error),
    });

    return handleApiError(error);
  }
}
```

### Service Layer 메서드

```typescript
// lib/rounds/round.service.ts

/**
 * CALCULATING 상태가 오래 지속된 라운드 찾기
 *
 * 기준: settlementStartedAt + 10분 < NOW
 */
async findStuckCalculatingRounds(): Promise<Round[]> {
  const threshold = Date.now() - getRecoveryStuckThresholdMs();

  return this.db
    .select()
    .from(rounds)
    .where(
      and(
        eq(rounds.status, 'CALCULATING'),
        lt(rounds.settlementStartedAt, threshold)
      )
    )
    .orderBy(asc(rounds.settlementStartedAt));
}
```

### 알림 정책

| 상황                   | Level    | 메시지                                   |
| ---------------------- | -------- | ---------------------------------------- |
| 정산 1회 실패          | WARNING  | "라운드 N 정산 실패, 재시도 예정"        |
| 정산 3회 실패          | CRITICAL | "라운드 N 정산 3회 실패, 수동 개입 필요" |
| Recovery Job 자체 실패 | ERROR    | "Recovery Job 실패"                      |

---

## 구현 노트 / 결정사항

> 💡 자세한 의사결정 기록은 `CRON_DECISIONS.md` 참조

### 기존 결정사항

- 첫 라운드 앵커: 라운드가 없으면 KST 02/08/14/20(UTC+9) 그리드로 올림해 시작 슬롯을 잡는다. 이후에는 마지막 라운드의 `startTime`에서 +6h로만 이어간다.
- 아이도템포턴시: 동일 `type+startTime` 라운드가 이미 있으면 새로 만들지 않고 기존 라운드를 반환한다. DB에 `type+start_time` 유니크 인덱스를 추가하면 안전성이 더 높아진다(현재는 `type+round_number`만 유니크).
- 잘못된 슬롯 자동 교정은 하지 않는다. 앵커 불일치나 겹침은 에러/알림으로 처리하고, 수동/관리자 플로우로 정리한다.
- 크론 인증: 모든 cron 엔드포인트는 `X-Cron-Secret` 헤더와 `CRON_SECRET` 환경 변수를 비교해 검증한다. 값은 환경별로 32바이트 이상 랜덤으로 생성하며 코드에 하드코딩하지 않는다.
- 라우트 로깅: `[CRON]` prefix 로거로 시작/완료/실패, 소요 시간, roundId/roundNumber 등을 남긴다. 인증 실패도 경고 로그로 남긴다.

### 2025-11-25 추가 결정사항

- **Job 실행 순서**: Job 4 (Finalize) 먼저 실행, Job 2 (Open) 이후 실행. 이전 라운드 정산이 더 중요.
- **DRAW 제거**: 동률 시 금(GOLD) 승리. 환불 로직 불필요, VOIDED 상태는 시스템 오류 시만 사용.
- **가격 API 실패 시**: CANCELLED 처리. 현준님 API에서 fallback 구현 요청.
- **DELAYED 상태**: 도입 안 함. 상태 복잡도 증가 방지.
- **Sui 필드 (Week 1)**: `suiPoolAddress`, `suiSettlementObjectId` 옵셔널 처리. Week 2에서 필수로 변경.
- **설정 분리**: `lib/config/cron.ts` 생성. 환경변수 + constant 분리.

### 2025-11-25 라운드 처리 방식 결정 (신규)

#### 단일 라운드 처리

**변경 전:**

```typescript
// 모든 SCHEDULED 라운드 처리
const scheduledRounds = await findScheduledRounds();
for (const round of scheduledRounds) { ... }
```

**변경 후:**

```typescript
// 가장 최근 1개만 처리
const round = await findLatestScheduledRound();
if (!round) return;
```

**이유:**

- 정상 상황에서는 항상 1개만 해당
- 비정상 라운드는 복구 대신 CANCEL 처리 (단순화)
- 코드 복잡도 감소, 예측 가능한 동작

#### 복구 전략 분리

| Job                  | 돈 걸림? | 실패 시         | 이유                      |
| -------------------- | -------- | --------------- | ------------------------- |
| **Job 1** (Create)   | ❌       | 알림            | 라운드 없으면 다음 진행   |
| **Job 2** (Open)     | ❌       | CANCEL + 알림   | lockTime 지나면 의미 없음 |
| **Job 3** (Lock)     | ❌       | 무시            | API에서 막고 있음         |
| **Job 4** (Finalize) | ✅       | Recovery 재시도 | 베팅 정산 필요            |
| **Job 5** (Settle)   | ✅       | Recovery 재시도 | 배당 지급 필요            |

**핵심 원칙:**

- 돈 안 걸린 Job (1,2,3): **빠른 실패 + CANCEL + 다음 라운드**
- 돈 걸린 Job (4,5): **Recovery에서 반드시 재시도**

#### 시간 조건 검증 추가

각 Job은 단순 status만이 아닌 **시간 조건도 검증**:

```typescript
// Job 2: startTime 지났지만 lockTime 안 지났을 때만 오픈
if (round.startTime > now) return; // 아직 안 됨
if (now >= round.lockTime) {
  await cancelRound(round.id, 'MISSED_OPEN_WINDOW');
  return;
}
```

#### Service Layer vs FSM 역할 분리

**Service Layer (조회 + 공통 작업):**

| 기능                           | 메서드명                       |
| ------------------------------ | ------------------------------ |
| SCHEDULED 라운드 1개 찾기      | `findLatestScheduledRound()`   |
| BETTING_OPEN 라운드 1개 찾기   | `findLatestOpenRound()`        |
| BETTING_LOCKED 라운드 1개 찾기 | `findLatestLockedRound()`      |
| CALCULATING 10분+ 라운드 찾기  | `findStuckCalculatingRounds()` |
| 라운드 취소 (FSM 래핑)         | `cancelRound(roundId, params)` |
| 재시도 카운트 증가             | `incrementRetryCount(roundId)` |

**FSM (상태 전이) - Route에서 직접 호출:**  
PRICE_PENDING 제거 → 5단계 FSM. BETTING_LOCKED에서 CALCULATING으로 바로 전이한다.

| 전이                          | 필수 metadata                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| SCHEDULED → BETTING_OPEN      | `goldStartPrice`, `btcStartPrice`, `priceSnapshotStartAt`, `startPriceSource`, `bettingOpenedAt`                                         |
| BETTING_OPEN → BETTING_LOCKED | `bettingLockedAt`                                                                                                                        |
| BETTING_LOCKED → CALCULATING  | `roundEndedAt`, `goldEndPrice`, `btcEndPrice`, `priceSnapshotEndAt`, `endPriceSource`, `goldChangePercent`, `btcChangePercent`, `winner` |
| CALCULATING → SETTLED         | `platformFeeCollected`, `settlementCompletedAt`                                                                                          |
| \* → CANCELLED                | (선택) `cancellationReason`, `cancellationMessage`, `cancelledBy`, `cancelledAt`                                                         |

---

## Cloudflare Workers Cron 설정

### wrangler.toml 전체 설정

```toml
name = "deltax"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "deltax-db"
database_id = "<D1_DATABASE_ID>"

# KV Namespace (Redis 대체)
[[kv_namespaces]]
binding = "KV"
id = "<KV_NAMESPACE_ID>"

# Environment Variables
[vars]
NODE_ENV = "production"
NEXT_PUBLIC_BASE_URL = "https://deltax.app"

# Secrets (wrangler secret put <NAME>)
# CRON_SECRET
# SUI_ADMIN_PRIVATE_KEY
# SLACK_WEBHOOK_URL

# Cron Triggers
[triggers]
crons = [
  # Job 1: Round Creator (T-10분)
  "50 16,22,4,10 * * *",

  # Job 2: Round Opener (T+0)
  "0 17,23,5,11 * * *",

  # Job 3: Betting Locker (T+1분)
  "1 17,23,5,11 * * *",

  # Job 4: Round Finalizer (T+6시간, Job 2와 동일)
  # "0 17,23,5,11 * * *",  # Job 2와 중복이므로 생략

  # Job 6: Recovery (매분)
  "* * * * *"
]
```

### Cloudflare Workers scheduled 핸들러

```typescript
// worker.ts (Cloudflare Workers 전용)

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const { cron } = event;
    console.log(`[Cron] Triggered: ${cron}`);

    // Job 결정
    const jobs = [];

    if (cron === '50 16,22,4,10 * * *') {
      jobs.push('/api/cron/rounds/create');
    } else if (cron === '0 17,23,5,11 * * *') {
      jobs.push('/api/cron/rounds/open');
      jobs.push('/api/cron/rounds/finalize'); // 동시 실행
    } else if (cron === '1 17,23,5,11 * * *') {
      jobs.push('/api/cron/rounds/lock');
    } else if (cron === '* * * * *') {
      jobs.push('/api/cron/recovery');
    }

    // 각 Job 실행
    await Promise.allSettled(
      jobs.map(async (job) => {
        const response = await fetch(`${env.NEXT_PUBLIC_BASE_URL}${job}`, {
          method: 'POST',
          headers: {
            'X-Cron-Secret': env.CRON_SECRET,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`[Cron] Job ${job} failed:`, await response.text());
        } else {
          console.log(`[Cron] Job ${job} completed`);
        }
      }),
    );
  },
};
```

---

## 에러 처리 및 재시도

### 재시도 전략 요약

| Job | 재시도 횟수 | 지연 시간 | 실패 시 조치         |
| --- | ----------- | --------- | -------------------- |
| 1   | 3회         | 5초       | Slack 알림           |
| 2   | 3회         | 5초       | Fallback → Slack     |
| 3   | 3회         | 5초       | Slack 알림           |
| 4   | 3회         | 5초       | Fallback → Slack     |
| 5   | 무제한      | Job 6     | 3회 후 Slack (Job 6) |
| 6   | -           | -         | Slack 알림           |

### 공통 재시도 함수

```typescript
// lib/cron/retry.ts

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    jobName: string;
  },
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const delayMs = options.delayMs || 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        cronLogger.info(`[${options.jobName}] Retry attempt ${attempt} succeeded`);
      }
      return result;
    } catch (error) {
      cronLogger.warn(`[${options.jobName}] Attempt ${attempt}/${maxRetries} failed`, {
        error: error.message,
      });

      if (attempt === maxRetries) {
        // 최종 실패 → Slack 알림
        await sendSlackAlert({
          level: 'ERROR',
          job: options.jobName,
          message: `${maxRetries}회 재시도 후 실패`,
          details: {
            error: error.message,
            stack: error.stack,
          },
        });

        throw error;
      }

      // 대기 후 재시도
      await sleep(delayMs);
    }
  }

  throw new Error('Unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 에러 클래스/코드 표준 (Service → Route 매핑)

- Service는 `lib/shared/errors.ts` 클래스만 던진다. Route(Controller)에서 `handleApiError`로 HTTP 응답 변환 + Slack 알림을 맡는다. Service는 HTTP 유틸을 import하지 않는다.
- 권장 코드
  - 시간 조건 불충족: `BusinessRuleError('ROUND_NOT_READY', ...)`
  - 필수 데이터 없음: `BusinessRuleError('ROUND_DATA_MISSING', { missing })`
  - 상태 전이 불가: `BusinessRuleError('INVALID_TRANSITION', ...)` (FSM)
  - 가격 조회 실패: `ServiceError('PRICE_FETCH_FAILED', { cause })`
  - Job 5 트리거 실패: `ServiceError('SETTLEMENT_TRIGGER_FAILED', { cause })`
  - 알 수 없는 예외: `ServiceError('INTERNAL_ERROR', { cause })`
- 실패 시 **상태를 미리 바꾸지 않는다**. 계산 전 실패 → BETTING_LOCKED 유지, 전이 후 실패 → CALCULATING에 머물러 Recovery 대상이 되도록 한다.

---

## 모니터링 및 알림

### Slack Webhook 설정

```typescript
// lib/cron/slack.ts

export async function sendSlackAlert(params: {
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  job: string;
  message: string;
  details?: Record<string, any>;
}) {
  const { level, job, message, details } = params;

  const color = {
    INFO: '#36a64f',
    WARNING: '#ff9800',
    ERROR: '#f44336',
    CRITICAL: '#9c27b0',
  }[level];

  const payload = {
    attachments: [
      {
        color,
        title: `[${level}] ${job}`,
        text: message,
        fields: details
          ? Object.entries(details).map(([key, value]) => ({
              title: key,
              value: JSON.stringify(value, null, 2),
              short: false,
            }))
          : [],
        footer: 'deltaX Cron Job',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    cronLogger.warn('[Slack] Webhook URL not configured');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      cronLogger.error('[Slack] Failed to send alert', await response.text());
    }
  } catch (error) {
    cronLogger.error('[Slack] Failed to send alert', error);
  }
}
```

### 알림 트리거 규칙

**Critical 알림**:

- 정산 3회 실패
- CALCULATING 상태 30분 이상
- 가격 API 연속 10회 실패
- Sui 네트워크 다운 감지
- CRON_SECRET 누락

**Warning 알림**:

- 정산 1회 실패
- Cron Job 5초 이상 지연
- Redis 캐시 미스율 50% 이상
- Fallback 가격 사용

**Info 알림**:

- 라운드 생성 성공
- 정산 완료

---

## 로컬 개발 환경

### 로컬에서 Cron Job 테스트

**Postman Collection 사용**:

```json
{
  "info": {
    "name": "deltaX Cron Jobs",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Job 1: Create Round",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "X-Cron-Secret",
            "value": "{{CRON_SECRET}}"
          }
        ],
        "url": {
          "raw": "{{BASE_URL}}/api/cron/rounds/create",
          "host": ["{{BASE_URL}}"],
          "path": ["api", "cron", "rounds", "create"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "BASE_URL",
      "value": "http://localhost:3000"
    },
    {
      "key": "CRON_SECRET",
      "value": "your-secret-here"
    }
  ]
}
```

**또는 curl**:

```bash
# Job 1: 라운드 생성
curl -X POST http://localhost:3000/api/cron/rounds/create \
  -H "X-Cron-Secret: your-secret-here" \
  -H "Content-Type: application/json"

# Job 2: 라운드 시작
curl -X POST http://localhost:3000/api/cron/rounds/open \
  -H "X-Cron-Secret: your-secret-here"

# Job 3: 베팅 마감
curl -X POST http://localhost:3000/api/cron/rounds/lock \
  -H "X-Cron-Secret: your-secret-here"

# Job 4: 라운드 종료
curl -X POST http://localhost:3000/api/cron/rounds/finalize \
  -H "X-Cron-Secret: your-secret-here"

# Job 5: 정산 (roundId 필요)
curl -X POST http://localhost:3000/api/cron/rounds/settle \
  -H "X-Cron-Secret: your-secret-here" \
  -H "Content-Type: application/json" \
  -d '{"roundId": "uuid-here"}'

# Job 6: 복구
curl -X POST http://localhost:3000/api/cron/recovery \
  -H "X-Cron-Secret: your-secret-here"
```

### 로컬 Cron 시뮬레이터

```typescript
// scripts/cron-simulator.ts

import { schedule } from 'node-cron';

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = 'http://localhost:3000';

async function callCronJob(path: string, body?: any) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'X-Cron-Secret': CRON_SECRET!,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  console.log(`[${path}]`, response.status, await response.text());
}

// Job 1: 매시 50분
schedule('50 * * * *', () => {
  console.log('[Cron] Job 1: Round Creator');
  callCronJob('/api/cron/rounds/create');
});

// Job 2, 4: 매 6시간 정각
schedule('0 */6 * * *', () => {
  console.log('[Cron] Job 2, 4: Round Opener & Finalizer');
  callCronJob('/api/cron/rounds/open');
  callCronJob('/api/cron/rounds/finalize');
});

// Job 3: 매 6시간 1분
schedule('1 */6 * * *', () => {
  console.log('[Cron] Job 3: Betting Locker');
  callCronJob('/api/cron/rounds/lock');
});

// Job 6: 매분
schedule('* * * * *', () => {
  console.log('[Cron] Job 6: Recovery');
  callCronJob('/api/cron/recovery');
});

console.log('[Cron Simulator] Started');
```

---

## 테스트 전략

### 단위 테스트

```typescript
// __tests__/lib/rounds/calculator.test.ts

import { determineWinner, calculatePayout } from '@/lib/rounds/calculator';

describe('determineWinner', () => {
  it('should return GOLD when gold has higher change', () => {
    const result = determineWinner({
      goldStart: 2650,
      goldEnd: 2680, // +1.13%
      btcStart: 98000,
      btcEnd: 99000, // +1.02%
    });

    expect(result.winner).toBe('GOLD');
  });

  it('should return GOLD when changes are equal (동률 시 금 승리)', () => {
    const result = determineWinner({
      goldStart: 2650,
      goldEnd: 2652.65, // +0.10%
      btcStart: 98000,
      btcEnd: 98098, // +0.10%
    });

    // DRAW 제거됨 - 동률 시 금 승리
    expect(result.winner).toBe('GOLD');
  });

  it('should return BTC when btc has higher change', () => {
    const result = determineWinner({
      goldStart: 2650,
      goldEnd: 2660, // +0.38%
      btcStart: 98000,
      btcEnd: 99000, // +1.02%
    });

    expect(result.winner).toBe('BTC');
  });
});

describe('calculatePayout', () => {
  it('should calculate correct payout ratio for GOLD winner', () => {
    const result = calculatePayout({
      winner: 'GOLD',
      totalPool: 1000000,
      totalGoldBets: 600000,
      totalBtcBets: 400000,
      platformFeeRate: 0.05,
    });

    expect(result.platformFee).toBe(50000); // 5%
    expect(result.payoutPool).toBe(950000);
    expect(result.payoutRatio).toBeCloseTo(1.583, 2); // 950000 / 600000
    expect(result.winningPool).toBe(600000);
  });

  it('should calculate correct payout ratio for BTC winner', () => {
    const result = calculatePayout({
      winner: 'BTC',
      totalPool: 1000000,
      totalGoldBets: 600000,
      totalBtcBets: 400000,
      platformFeeRate: 0.05,
    });

    expect(result.platformFee).toBe(50000); // 5%
    expect(result.payoutPool).toBe(950000);
    expect(result.payoutRatio).toBeCloseTo(2.375, 2); // 950000 / 400000
    expect(result.winningPool).toBe(400000);
  });

  // DRAW 테스트 제거됨 - 동률 시 금 승리로 단순화
});
```

### 통합 테스트

```typescript
// __tests__/api/cron/rounds/create.test.ts

import { POST } from '@/app/api/cron/rounds/create/route';
import { NextRequest } from 'next/server';

describe('POST /api/cron/rounds/create', () => {
  it('should create a new round', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/rounds/create', {
      method: 'POST',
      headers: {
        'X-Cron-Secret': process.env.CRON_SECRET!,
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.round.status).toBe('SCHEDULED');
  });

  it('should reject invalid cron secret', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/rounds/create', {
      method: 'POST',
      headers: {
        'X-Cron-Secret': 'invalid-secret',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });
});
```

### E2E 테스트 (시나리오)

```typescript
// __tests__/e2e/round-lifecycle.test.ts

describe('Round Lifecycle E2E', () => {
  it('should complete full round lifecycle', async () => {
    // 1. Job 1: Create Round
    const createRes = await callCronJob('/api/cron/rounds/create');
    const round = createRes.data.round;
    expect(round.status).toBe('SCHEDULED');

    // 2. Job 2: Open Round
    const openRes = await callCronJob('/api/cron/rounds/open');
    expect(openRes.data.results[0].status).toBe('success');

    const openedRound = await getRound(round.id);
    expect(openedRound.status).toBe('BETTING_OPEN');
    expect(openedRound.goldStartPrice).toBeDefined();

    // 3. Mock 베팅
    await createBet({ roundId: round.id, prediction: 'GOLD', amount: 1000 });
    await createBet({ roundId: round.id, prediction: 'BTC', amount: 500 });

    // 4. Job 3: Lock Round
    const lockRes = await callCronJob('/api/cron/rounds/lock');
    const lockedRound = await getRound(round.id);
    expect(lockedRound.status).toBe('BETTING_LOCKED');

    // 5. Job 4: Finalize Round
    const finalizeRes = await callCronJob('/api/cron/rounds/finalize');
    const finalizedRound = await getRound(round.id);
    expect(finalizedRound.status).toBe('CALCULATING');
    expect(finalizedRound.winner).toBeDefined();

    // 6. Job 5 자동 트리거 대기
    await sleep(2000);

    const settledRound = await getRound(round.id);
    expect(settledRound.status).toBe('SETTLED');

    // 7. 베팅 정산 확인
    const bets = await getBets(round.id);
    expect(bets.every((b) => b.settlementStatus === 'COMPLETED')).toBe(true);
  });
});
```

---

## 요약

### Cron Job 전체 플로우

```
T-10분: Job 1 (Create)
  ↓
T+0: Job 2 (Open) + Job 4 (Finalize 이전 라운드)
  ↓
T+1분: Job 3 (Lock)
  ↓
(5시간 59분 대기)
  ↓
T+6시간: Job 4 (Finalize) + Job 2 (Open 다음 라운드)
  ↓
즉시: Job 5 (Settle)
  ↓
완료: status = SETTLED

(매분) Job 6 (Recovery) - 실패한 정산 재시도
```

### 구현 체크리스트

**Week 1 (Mock 버전)**:

- [x] lib/cron/auth.ts - Cron Secret 검증
- [x] lib/cron/logger.ts - Cron 전용 로거
- [x] lib/rounds/fsm.ts - 상태 전이 로직 (Sui 필드 옵셔널 처리 완료)
- [x] lib/rounds/calculator.ts - 승자 판정, 배당 계산 (DRAW 제거 완료)
- [x] lib/config/cron.ts - 설정값 분리
- [x] app/api/cron/scheduled/route.ts - Cron Handler (Job 4→Job 2 순차 실행)
- [x] app/api/cron/rounds/create/route.ts - Job 1
- [ ] app/api/cron/rounds/open/route.ts - Job 2 (단일 라운드 처리, 시간 조건 검증)
- [ ] app/api/cron/rounds/lock/route.ts - Job 3 (단일 라운드 처리)
- [ ] lib/rounds/round.service.ts - 신규 메서드 추가:
  - [ ] `findLatestScheduledRound()`
  - [ ] `findLatestOpenRound()`
  - [ ] `findLatestLockedRound()`
  - [ ] `openRound()`
  - [ ] `lockRound()`
  - [ ] `cancelRound()`
- [ ] curl로 수동 테스트

**Week 2 (Sui 통합)**:

- [ ] app/api/cron/rounds/finalize/route.ts - Job 4 (단일 라운드 처리, Recovery 대상)
- [ ] app/api/cron/rounds/settle/route.ts - Job 5 (멱등성 보장, Recovery 대상)
- [ ] app/api/cron/recovery/route.ts - Job 6 (CALCULATING 복구)
- [ ] lib/cron/slack.ts - Slack 알림
- [ ] lib/rounds/round.service.ts - 신규 메서드 추가:
  - [ ] `findStuckCalculatingRounds()`
  - [ ] `finalizeRound()`
  - [ ] `settleRound()`
  - [ ] `incrementRetryCount()`
- [ ] FSM 필수 필드 복원 (suiPoolAddress, suiSettlementObjectId)

**Week 3 (배포)**:

- [ ] wrangler.toml Cron 설정
- [ ] WebSocket 이벤트 발행
- [ ] E2E 테스트

### 중요 포인트

1. **단일 라운드 처리**: 각 Job은 "가장 최근 1개"만 처리
2. **시간 조건 검증**: status뿐만 아니라 시간도 확인
3. **복구 전략 분리**: 돈 걸린 Job만 Recovery 대상
4. **멱등성**: 같은 Job을 여러 번 실행해도 안전
5. **모니터링**: Slack 알림으로 Critical 에러 즉시 감지

---
