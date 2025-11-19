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

### Job 개수 및 실행 주기

| Job | 이름                  | 실행 주기  | 실행 시각 (KST)            |
| --- | --------------------- | ---------- | -------------------------- |
| 1   | Round Creator         | 매일 4회   | 01:50, 07:50, 13:50, 19:50 |
| 2   | Round Opener          | 매일 4회   | 02:00, 08:00, 14:00, 20:00 |
| 3   | Betting Locker        | 매일 4회   | 02:01, 08:01, 14:01, 20:01 |
| 4   | Round Finalizer       | 매일 4회   | 02:00, 08:00, 14:00, 20:00 |
| 5   | Settlement Processor  | 이벤트기반 | (Job 4 완료 후 즉시)       |
| 6   | Recovery & Monitoring | 매분       | 매 분마다                  |

**참고**: Job 2와 Job 4는 같은 시각에 실행됩니다.

- Job 2: SCHEDULED → BETTING_OPEN (새 라운드 시작)
- Job 4: BETTING_LOCKED → CALCULATING (이전 라운드 종료)

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
import { NextRequest, NextResponse } from 'next/server';

/**
 * Cloudflare Workers Cron Handler
 *
 * Cloudflare Workers는 scheduled event를 보냄
 * 이 핸들러가 각 Cron Job API를 내부 호출
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // 현재 시각 (UTC)
  const now = new Date();
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();

  // 실행할 Job 결정
  const jobs = [];

  // Job 1: 매시 50분 (16, 22, 4, 10시)
  if (minute === 50 && [16, 22, 4, 10].includes(hour)) {
    jobs.push('/api/cron/rounds/create');
  }

  // Job 2, 4: 매시 0분 (17, 23, 5, 11시)
  if (minute === 0 && [17, 23, 5, 11].includes(hour)) {
    jobs.push('/api/cron/rounds/open');
    jobs.push('/api/cron/rounds/finalize');
  }

  // Job 3: 매시 1분 (17, 23, 5, 11시)
  if (minute === 1 && [17, 23, 5, 11].includes(hour)) {
    jobs.push('/api/cron/rounds/lock');
  }

  // Job 6: 매분
  jobs.push('/api/cron/recovery');

  // 각 Job 실행
  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}${job}`, {
        method: 'POST',
        headers: {
          'X-Cron-Secret': cronSecret!,
          'Content-Type': 'application/json',
        },
      });
      return { job, status: response.status };
    }),
  );

  return NextResponse.json({ success: true, results });
}
```

---

## Job 1: Round Creator

### 목적

다음 라운드를 미리 생성 (T-10분)

### 실행 시각

- **KST**: 01:50, 07:50, 13:50, 19:50
- **UTC**: 16:50, 22:50, 04:50, 10:50

### 구현 (`app/api/cron/rounds/create/route.ts`)

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';

/**
 * POST /api/cron/rounds/create
 *
 * Job 1: Round Creator
 *
 * 실행 주기: 매일 4회 (라운드 시작 10분 전)
 *
 * 처리 내용:
 * 1. 마지막 라운드 조회
 * 2. 다음 시작 시각 계산
 * 3. rounds 테이블에 INSERT
 * 4. status = 'SCHEDULED'
 * 5. WebSocket 발행
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  cronLogger.info('[Job 1] Round Creator started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 1] Auth failed');
      return authResult.response;
    }

    // 2. Service 호출
    const round = await registry.roundService.createNextScheduledRound();

    // 3. WebSocket 발행
    // TODO: Week 3에서 구현
    // await publishWebSocketEvent('round:created', {
    //   roundId: round.id,
    //   roundNumber: round.roundNumber,
    //   type: round.type,
    //   status: round.status,
    //   startTime: round.startTime,
    //   endTime: round.endTime,
    // });

    const duration = Date.now() - startTime;
    cronLogger.info(`[Job 1] Completed in ${duration}ms`, {
      roundId: round.id,
      roundNumber: round.roundNumber,
      startTime: round.startTime,
    });

    return createSuccessResponse({ round });
  } catch (error) {
    const duration = Date.now() - startTime;
    cronLogger.error(`[Job 1] Failed after ${duration}ms`, error);
    return handleApiError(error);
  }
}
```

### Service Layer (`lib/rounds/round.service.ts`)

```typescript
/**
 * 다음 라운드 자동 생성
 *
 * 로직:
 * 1. 마지막 라운드 조회 (가장 최근 startTime)
 * 2. 다음 시작 시각 = lastRound.startTime + 6시간
 * 3. endTime = startTime + 6시간
 * 4. lockTime = startTime + 1분
 * 5. roundNumber = lastRound.roundNumber + 1
 * 6. status = 'SCHEDULED'
 * 7. DB INSERT
 */
async createNextScheduledRound(): Promise<Round> {
  // 1. 마지막 라운드 조회
  const lastRound = await this.db
    .select()
    .from(rounds)
    .orderBy(desc(rounds.startTime))
    .limit(1);

  if (lastRound.length === 0) {
    // 첫 라운드 생성
    const now = Date.now();
    const nextHour = Math.ceil(now / (6 * 60 * 60 * 1000)) * (6 * 60 * 60 * 1000);

    return this.createRound({
      type: '6HOUR',
      startTime: nextHour,
    });
  }

  // 2. 다음 시작 시각 계산
  const lastStartTime = lastRound[0].startTime;
  const nextStartTime = lastStartTime + 6 * 60 * 60 * 1000; // +6시간

  // 3. 중복 체크
  const existing = await this.db
    .select()
    .from(rounds)
    .where(eq(rounds.startTime, nextStartTime))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError('DUPLICATE_ROUND', 'Round already exists for this time slot', {
      existingRoundId: existing[0].id,
      startTime: nextStartTime,
    });
  }

  // 4. 라운드 생성
  return this.createRound({
    type: '6HOUR',
    startTime: nextStartTime,
  });
}
```

### 재시도 전략

```typescript
// lib/cron/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    delayMs: number;
    jobName: string;
  },
): Promise<T> {
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      cronLogger.warn(`[${options.jobName}] Attempt ${attempt} failed`, error);

      if (attempt === options.maxRetries) {
        // 최종 실패 → Slack 알림
        await sendSlackAlert({
          level: 'ERROR',
          job: options.jobName,
          message: `${options.maxRetries}회 재시도 실패`,
          error,
        });
        throw error;
      }

      // 대기 후 재시도
      await sleep(options.delayMs);
    }
  }

  throw new Error('Unreachable');
}
```

---

## Job 2: Round Opener

### 목적

라운드 시작 및 베팅 활성화 (T+0)

### 실행 시각

- **KST**: 02:00, 08:00, 14:00, 20:00
- **UTC**: 17:00, 23:00, 05:00, 11:00

### 핵심 작업

1. **Start Price 스냅샷** (현준님 API 호출)
2. **Sui BettingPool 생성** (Week 2+)
3. **상태 전이**: `SCHEDULED → BETTING_OPEN`
4. **WebSocket 발행**: `round:status_changed`

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { getPrices } from '@/lib/prices/fetcher'; // 현준님 구현
import { transitionRoundStatus } from '@/lib/rounds/fsm';

/**
 * POST /api/cron/rounds/open
 *
 * Job 2: Round Opener
 *
 * 처리 내용:
 * 1. SCHEDULED 라운드 찾기 (startTime <= NOW)
 * 2. Start Price 스냅샷
 * 3. Sui BettingPool 생성
 * 4. status = 'BETTING_OPEN'
 * 5. WebSocket 발행
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  cronLogger.info('[Job 2] Round Opener started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      cronLogger.warn('[Job 2] Auth failed');
      return authResult.response;
    }

    // 2. SCHEDULED 라운드 찾기
    const scheduledRounds = await registry.roundService.findScheduledRounds();

    if (scheduledRounds.length === 0) {
      cronLogger.info('[Job 2] No scheduled rounds to open');
      return createSuccessResponse({ message: 'No scheduled rounds', rounds: [] });
    }

    // 3. 각 라운드 시작
    const results = [];
    for (const round of scheduledRounds) {
      try {
        // 3-1. Start Price 스냅샷
        cronLogger.info(`[Job 2] Fetching start prices for round ${round.id}`);

        let prices;
        try {
          prices = await getPrices(); // 현준님 API
          cronLogger.info(`[Job 2] Prices fetched`, prices);
        } catch (priceError) {
          // Fallback 처리
          cronLogger.error(`[Job 2] Price fetch failed, trying fallback`, priceError);
          prices = await registry.priceService.getPricesWithFallback();
        }

        // 3-2. Sui BettingPool 생성 (Week 2+)
        // TODO: Week 2에서 구현
        // const suiPoolAddress = await suiClient.call({
        //   target: `${PACKAGE_ID}::betting::create_pool`,
        //   arguments: [round.id, round.startTime, round.endTime]
        // });

        // 3-3. 상태 전이 (FSM)
        await transitionRoundStatus(round.id, 'BETTING_OPEN', {
          goldStartPrice: prices.gold.toString(),
          btcStartPrice: prices.btc.toString(),
          priceSnapshotStartAt: prices.timestamp.toISOString(),
          startPriceSource: prices.source,
          startPriceIsFallback: prices.isFallback || false,
          bettingOpenedAt: Date.now(),
          // suiPoolAddress: suiPoolAddress, // Week 2+
        });

        cronLogger.info(`[Job 2] Round ${round.id} opened`);
        results.push({ roundId: round.id, status: 'success' });

        // 3-4. WebSocket 발행
        // TODO: Week 3
        // await publishWebSocketEvent('round:status_changed', {
        //   roundId: round.id,
        //   fromStatus: 'SCHEDULED',
        //   toStatus: 'BETTING_OPEN',
        //   timestamp: Date.now(),
        // });
      } catch (error) {
        cronLogger.error(`[Job 2] Failed to open round ${round.id}`, error);
        results.push({ roundId: round.id, status: 'failed', error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    cronLogger.info(`[Job 2] Completed in ${duration}ms`, { results });

    return createSuccessResponse({ results });
  } catch (error) {
    const duration = Date.now() - startTime;
    cronLogger.error(`[Job 2] Failed after ${duration}ms`, error);
    return handleApiError(error);
  }
}
```

### Fallback 처리 (가격 API 실패 시)

```typescript
// lib/prices/fetcher.ts (현준님 구현 예정)

/**
 * Fallback이 적용된 가격 조회
 *
 * 우선순위:
 * 1. 실시간 API 호출
 * 2. Redis 캐시 (TTL 10분 이내)
 * 3. 실패 → DELAYED 상태로 전환 후 재시도
 */
export async function getPricesWithFallback(): Promise<PriceData> {
  try {
    // 1순위: 실시간 API
    return await getPrices();
  } catch (error) {
    cronLogger.warn('[Prices] Real-time fetch failed, trying cache', error);

    // 2순위: Redis 캐시
    const cachedGold = await redis.get('price:gold:latest');
    const cachedBtc = await redis.get('price:btc:latest');
    const cachedTimestamp = await redis.get('price:timestamp:latest');

    if (cachedGold && cachedBtc && cachedTimestamp) {
      const cacheAge = Date.now() - parseInt(cachedTimestamp);

      // 10분 이내 캐시만 사용
      if (cacheAge < 10 * 60 * 1000) {
        cronLogger.info('[Prices] Using cached prices', { cacheAge });
        return {
          gold: parseFloat(cachedGold),
          btc: parseFloat(cachedBtc),
          timestamp: new Date(parseInt(cachedTimestamp)),
          source: 'redis',
          isFallback: true,
        };
      }
    }

    // 3순위: 실패
    throw new AppError('PRICE_FETCH_FAILED', '가격 조회 실패 (Fallback도 실패)');
  }
}
```

---

## Job 3: Betting Locker

### 목적

베팅 마감 (T+1분)

### 실행 시각

- **KST**: 02:01, 08:01, 14:01, 20:01
- **UTC**: 17:01, 23:01, 05:01, 11:01

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
 * 처리 내용:
 * 1. BETTING_OPEN 라운드 찾기 (lockTime <= NOW)
 * 2. Sui Pool 잠금 (Week 2+)
 * 3. status = 'BETTING_LOCKED'
 * 4. WebSocket 발행
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  cronLogger.info('[Job 3] Betting Locker started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    // 2. BETTING_OPEN 라운드 찾기
    const openRounds = await registry.roundService.findOpenRounds();

    if (openRounds.length === 0) {
      cronLogger.info('[Job 3] No open rounds to lock');
      return createSuccessResponse({ message: 'No open rounds', rounds: [] });
    }

    // 3. 각 라운드 마감
    const results = [];
    for (const round of openRounds) {
      try {
        // 3-1. Sui Pool 잠금 (Week 2+)
        // TODO: Week 2에서 구현
        // await suiClient.call({
        //   target: `${PACKAGE_ID}::betting::lock_pool`,
        //   arguments: [round.suiPoolAddress]
        // });

        // 3-2. 상태 전이
        await transitionRoundStatus(round.id, 'BETTING_LOCKED', {
          bettingLockedAt: Date.now(),
        });

        cronLogger.info(`[Job 3] Round ${round.id} locked`);
        results.push({ roundId: round.id, status: 'success' });

        // 3-3. WebSocket 발행
        // TODO: Week 3
      } catch (error) {
        cronLogger.error(`[Job 3] Failed to lock round ${round.id}`, error);
        results.push({ roundId: round.id, status: 'failed', error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    cronLogger.info(`[Job 3] Completed in ${duration}ms`, { results });

    return createSuccessResponse({ results });
  } catch (error) {
    const duration = Date.now() - startTime;
    cronLogger.error(`[Job 3] Failed after ${duration}ms`, error);
    return handleApiError(error);
  }
}
```

### Service Layer

```typescript
/**
 * BETTING_OPEN 상태이고 lockTime이 경과한 라운드 찾기
 */
async findOpenRounds(): Promise<Round[]> {
  const now = Date.now();

  return this.db
    .select()
    .from(rounds)
    .where(
      and(
        eq(rounds.status, 'BETTING_OPEN'),
        lte(rounds.lockTime, now)
      )
    )
    .orderBy(asc(rounds.lockTime));
}
```

---

## Job 4: Round Finalizer

### 목적

라운드 종료 및 승자 판정 (T+6시간)

### 실행 시각

- **KST**: 02:00, 08:00, 14:00, 20:00 (Job 2와 동일)
- **UTC**: 17:00, 23:00, 05:00, 11:00

### 핵심 작업

1. **End Price 스냅샷**
2. **승자 판정** (금 vs 비트 변동률 비교)
3. **배당 계산**
4. **상태 전이**: `BETTING_LOCKED → PRICE_PENDING → CALCULATING`
5. **Job 5 트리거** (정산 처리)

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { getPricesWithFallback } from '@/lib/prices/fetcher';
import { transitionRoundStatus } from '@/lib/rounds/fsm';
import { determineWinner, calculatePayout } from '@/lib/rounds/calculator';

/**
 * POST /api/cron/rounds/finalize
 *
 * Job 4: Round Finalizer
 *
 * 처리 내용:
 * 1. BETTING_LOCKED 라운드 찾기 (endTime <= NOW)
 * 2. End Price 스냅샷
 * 3. 승자 판정
 * 4. 배당 계산
 * 5. status = 'CALCULATING'
 * 6. Job 5 트리거
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  cronLogger.info('[Job 4] Round Finalizer started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    // 2. BETTING_LOCKED 라운드 찾기
    const lockedRounds = await registry.roundService.findLockedRounds();

    if (lockedRounds.length === 0) {
      cronLogger.info('[Job 4] No locked rounds to finalize');
      return createSuccessResponse({ message: 'No locked rounds', rounds: [] });
    }

    // 3. 각 라운드 종료
    const results = [];
    for (const round of lockedRounds) {
      try {
        // 3-1. End Price 스냅샷
        cronLogger.info(`[Job 4] Fetching end prices for round ${round.id}`);
        const prices = await getPricesWithFallback();

        // 3-2. 승자 판정
        const winner = determineWinner({
          goldStart: parseFloat(round.goldStartPrice!),
          goldEnd: prices.gold,
          btcStart: parseFloat(round.btcStartPrice!),
          btcEnd: prices.btc,
        });

        cronLogger.info(`[Job 4] Winner determined: ${winner}`, {
          roundId: round.id,
          winner,
        });

        // 3-3. 배당 계산
        const payout = calculatePayout({
          winner,
          totalPool: round.totalPool,
          totalGoldBets: round.totalGoldBets,
          totalBtcBets: round.totalBtcBets,
          platformFeeRate: 0.05, // 5%
        });

        // 3-4. 상태 전이 (BETTING_LOCKED → PRICE_PENDING → CALCULATING)
        await transitionRoundStatus(round.id, 'PRICE_PENDING', {
          goldEndPrice: prices.gold.toString(),
          btcEndPrice: prices.btc.toString(),
          priceSnapshotEndAt: prices.timestamp.toISOString(),
          endPriceSource: prices.source,
          endPriceIsFallback: prices.isFallback || false,
          roundEndedAt: Date.now(),
        });

        await transitionRoundStatus(round.id, 'CALCULATING', {
          winner,
          goldChangePercent: payout.goldChangePercent.toString(),
          btcChangePercent: payout.btcChangePercent.toString(),
          platformFee: payout.platformFee,
          payoutPool: payout.payoutPool,
          payoutRatio: payout.payoutRatio.toString(),
          settlementStartedAt: Date.now(),
        });

        cronLogger.info(`[Job 4] Round ${round.id} finalized`);
        results.push({ roundId: round.id, status: 'success', winner });

        // 3-5. Job 5 트리거 (정산 처리)
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/cron/rounds/settle`, {
          method: 'POST',
          headers: {
            'X-Cron-Secret': process.env.CRON_SECRET!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roundId: round.id }),
        });
      } catch (error) {
        cronLogger.error(`[Job 4] Failed to finalize round ${round.id}`, error);
        results.push({ roundId: round.id, status: 'failed', error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    cronLogger.info(`[Job 4] Completed in ${duration}ms`, { results });

    return createSuccessResponse({ results });
  } catch (error) {
    const duration = Date.now() - startTime;
    cronLogger.error(`[Job 4] Failed after ${duration}ms`, error);
    return handleApiError(error);
  }
}
```

### 승자 판정 로직 (`lib/rounds/calculator.ts`)

```typescript
/**
 * 승자 판정
 *
 * 규칙:
 * - 변동률이 더 높은 자산이 승리
 * - 차이가 0.01% 이내면 무승부 (DRAW)
 */
export function determineWinner(params: {
  goldStart: number;
  goldEnd: number;
  btcStart: number;
  btcEnd: number;
}): 'GOLD' | 'BTC' | 'DRAW' {
  const { goldStart, goldEnd, btcStart, btcEnd } = params;

  // 변동률 계산 (%)
  const goldChange = ((goldEnd - goldStart) / goldStart) * 100;
  const btcChange = ((btcEnd - btcStart) / btcStart) * 100;

  // 차이 계산
  const diff = Math.abs(goldChange - btcChange);

  // 무승부 기준: 0.01% (0.0001)
  const DRAW_THRESHOLD = 0.01;

  if (diff < DRAW_THRESHOLD) {
    return 'DRAW';
  } else if (goldChange > btcChange) {
    return 'GOLD';
  } else {
    return 'BTC';
  }
}

/**
 * 배당 계산
 */
export function calculatePayout(params: {
  winner: 'GOLD' | 'BTC' | 'DRAW';
  totalPool: number;
  totalGoldBets: number;
  totalBtcBets: number;
  platformFeeRate: number;
}) {
  const { winner, totalPool, totalGoldBets, totalBtcBets, platformFeeRate } = params;

  // 플랫폼 수수료
  const platformFee = Math.floor(totalPool * platformFeeRate);
  const payoutPool = totalPool - platformFee;

  // 무승부: 수수료 없이 전액 환불
  if (winner === 'DRAW') {
    return {
      platformFee: 0,
      payoutPool: totalPool,
      payoutRatio: 1.0, // 1:1 환불
      goldChangePercent: 0,
      btcChangePercent: 0,
    };
  }

  // 승자 풀
  const winningPool = winner === 'GOLD' ? totalGoldBets : totalBtcBets;

  // 배당 비율
  const payoutRatio = winningPool > 0 ? payoutPool / winningPool : 0;

  return {
    platformFee,
    payoutPool,
    payoutRatio,
    goldChangePercent: 0, // TODO: 실제 계산
    btcChangePercent: 0,
  };
}
```

---

## Job 5: Settlement Processor

### 목적

정산 처리 및 배당 지급

### 실행 방식

**이벤트 기반** (Job 4가 트리거)

### 핵심 작업

1. **Sui Settlement Object 생성**
2. **승자에게 배당 전송** (루프)
3. **패자 상태 업데이트**
4. **상태 전이**: `CALCULATING → SETTLED/VOIDED`
5. **WebSocket 발행**

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { transitionRoundStatus } from '@/lib/rounds/fsm';

/**
 * POST /api/cron/rounds/settle
 *
 * Job 5: Settlement Processor
 *
 * 처리 내용:
 * 1. CALCULATING 라운드 조회
 * 2. 승자 베팅 목록 조회
 * 3. Sui Settlement Object 생성
 * 4. 각 승자에게 배당 전송
 * 5. 패자 상태 업데이트
 * 6. status = 'SETTLED' or 'VOIDED'
 * 7. WebSocket 발행
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const body = await request.json();
  const { roundId } = body;

  cronLogger.info(`[Job 5] Settlement Processor started for round ${roundId}`);

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    // 2. 라운드 조회
    const round = await registry.roundService.findRoundById(roundId);

    if (!round || round.status !== 'CALCULATING') {
      throw new AppError('NO_CALCULATING_ROUND', 'Round not in CALCULATING status');
    }

    // 3. 승자/패자 베팅 조회
    const allBets = await registry.betService.findBetsByRoundId(roundId);
    const winningBets = allBets.filter((bet) => bet.prediction === round.winner);
    const losingBets = allBets.filter((bet) => bet.prediction !== round.winner);

    cronLogger.info(`[Job 5] Found ${winningBets.length} winners, ${losingBets.length} losers`);

    // 4. 무승부 처리
    if (round.winner === 'DRAW') {
      await processDrawSettlement(round, allBets);
      return createSuccessResponse({
        round: { id: round.id, status: 'VOIDED' },
        settledBets: allBets.length,
        payoutsSent: allBets.length,
      });
    }

    // 5. 정상 정산
    // 5-1. Sui Settlement Object 생성
    // TODO: Week 2
    // const suiSettlementObjectId = await suiClient.call({
    //   target: `${PACKAGE_ID}::settlement::finalize_round`,
    //   arguments: [roundId, round.winner, round.totalPool, round.payoutPool]
    // });

    // 5-2. 각 승자에게 배당 전송
    let settledCount = 0;
    let failedCount = 0;

    for (const bet of winningBets) {
      try {
        // 개별 배당 계산
        const winningPool = round.winner === 'GOLD' ? round.totalGoldBets : round.totalBtcBets;
        const userShare = bet.amount / winningPool;
        const payout = Math.floor(userShare * round.payoutPool);

        // Sui Payout 전송
        // TODO: Week 2
        // const txHash = await suiClient.call({
        //   target: `${PACKAGE_ID}::settlement::distribute_payout`,
        //   arguments: [bet.suiBetObjectId, bet.userAddress, payout]
        // });

        // D1 업데이트
        await registry.betService.updateBetSettlement(bet.id, {
          settlementStatus: 'COMPLETED',
          resultStatus: 'WON',
          payoutAmount: payout,
          // suiPayoutTxHash: txHash,
          settledAt: Date.now(),
        });

        settledCount++;
      } catch (error) {
        cronLogger.error(`[Job 5] Failed to settle bet ${bet.id}`, error);

        await registry.betService.updateBetSettlement(bet.id, {
          settlementStatus: 'FAILED',
        });

        failedCount++;
      }
    }

    // 5-3. 패자 처리 (Sui 전송 없음)
    for (const bet of losingBets) {
      await registry.betService.updateBetSettlement(bet.id, {
        settlementStatus: 'COMPLETED',
        resultStatus: 'LOST',
        payoutAmount: 0,
        settledAt: Date.now(),
      });
    }

    // 6. 라운드 최종 상태 업데이트
    if (failedCount === 0) {
      await transitionRoundStatus(round.id, 'SETTLED', {
        // suiSettlementObjectId,
        totalWinners: winningBets.length,
        totalLosers: losingBets.length,
        settlementCompletedAt: Date.now(),
      });

      cronLogger.info(`[Job 5] Round ${round.id} settled successfully`);
    } else {
      cronLogger.warn(`[Job 5] Round ${round.id} partially settled`, {
        settledCount,
        failedCount,
      });

      // 재시도 카운트 증가
      await registry.roundService.incrementRetryCount(round.id);
    }

    const duration = Date.now() - startTime;
    cronLogger.info(`[Job 5] Completed in ${duration}ms`, { settledCount, failedCount });

    return createSuccessResponse({
      round: { id: round.id, status: failedCount === 0 ? 'SETTLED' : 'CALCULATING' },
      settledBets: settledCount + losingBets.length,
      payoutsSent: settledCount,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    cronLogger.error(`[Job 5] Failed after ${duration}ms`, error);
    return handleApiError(error);
  }
}

/**
 * 무승부 정산 (전액 환불)
 */
async function processDrawSettlement(round: Round, bets: Bet[]) {
  for (const bet of bets) {
    const refund = bet.amount; // 원금 그대로

    // Sui Unlock
    // TODO: Week 2
    // await suiClient.call({
    //   target: `${PACKAGE_ID}::betting::unlock_bet`,
    //   arguments: [bet.suiBetObjectId, bet.userAddress, refund]
    // });

    // D1 업데이트
    await registry.betService.updateBetSettlement(bet.id, {
      settlementStatus: 'COMPLETED',
      resultStatus: 'REFUNDED',
      payoutAmount: refund,
      settledAt: Date.now(),
    });
  }

  // 라운드 VOIDED 처리
  await transitionRoundStatus(round.id, 'VOIDED', {
    voidReason: 'DRAW',
    refundCompleted: true,
    refundCount: bets.length,
    voidedAt: Date.now(),
  });
}
```

### 멱등성 보장

```typescript
/**
 * 정산 상태 확인 후 건너뛰기
 */
async function settleBetIdempotent(bet: Bet, payout: number) {
  // 이미 정산된 베팅은 건너뛰기
  if (bet.settlementStatus === 'COMPLETED') {
    cronLogger.info(`[Job 5] Bet ${bet.id} already settled, skipping`);
    return;
  }

  // 정산 처리...
}
```

---

## Job 6: Recovery & Monitoring

### 목적

실패한 정산 복구 및 시스템 모니터링

### 실행 시각

**매분** (`* * * * *`)

### 핵심 작업

1. **장시간 멈춰있는 라운드 찾기** (CALCULATING 10분+)
2. **미정산 베팅 재시도**
3. **3회 실패 라운드 → Slack 알림**
4. **서버 재시작 시 자동 복구**

### 구현

```typescript
import { NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { registry } from '@/lib/registry';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { cronLogger } from '@/lib/cron/logger';
import { sendSlackAlert } from '@/lib/cron/slack';

/**
 * POST /api/cron/recovery
 *
 * Job 6: Recovery & Monitoring
 *
 * 처리 내용:
 * 1. CALCULATING 상태 10분+ 라운드 찾기
 * 2. 미정산 베팅 재시도
 * 3. 3회 실패 시 Slack 알림
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  cronLogger.info('[Job 6] Recovery started');

  try {
    // 1. 인증 검증
    const authResult = await verifyCronAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    // 2. 멈춰있는 라운드 찾기
    const stuckRounds = await registry.roundService.findStuckRounds();

    if (stuckRounds.length === 0) {
      cronLogger.info('[Job 6] No stuck rounds found');
      return createSuccessResponse({ message: 'No stuck rounds', recoveredRounds: [] });
    }

    cronLogger.warn(`[Job 6] Found ${stuckRounds.length} stuck rounds`);

    // 3. 각 라운드 복구 시도
    const recoveredRounds = [];
    const alertsSent = [];

    for (const round of stuckRounds) {
      try {
        // 3-1. 미정산 베팅 찾기
        const pendingBets = await registry.betService.findPendingBets(round.id);

        cronLogger.info(`[Job 6] Round ${round.id}: ${pendingBets.length} pending bets`);

        // 3-2. 재정산 시도
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/cron/rounds/settle`, {
          method: 'POST',
          headers: {
            'X-Cron-Secret': process.env.CRON_SECRET!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roundId: round.id }),
        });

        recoveredRounds.push({
          roundId: round.id,
          recoveredBets: pendingBets.length,
          previousStatus: 'CALCULATING',
        });
      } catch (error) {
        cronLogger.error(`[Job 6] Failed to recover round ${round.id}`, error);

        // 재시도 카운트 증가
        const retryCount = await registry.roundService.incrementRetryCount(round.id);

        // 3회 실패 → Slack 알림
        if (retryCount >= 3) {
          await sendSlackAlert({
            level: 'CRITICAL',
            job: 'Recovery',
            message: `Round ${round.id} 정산 3회 실패, 수동 개입 필요`,
            details: {
              roundId: round.id,
              retryCount,
              pendingBets: await registry.betService
                .findPendingBets(round.id)
                .then((b) => b.length),
              error: error.message,
            },
          });

          alertsSent.push({ roundId: round.id, reason: 'MAX_RETRIES_EXCEEDED' });
        }
      }
    }

    const duration = Date.now() - startTime;
    cronLogger.info(`[Job 6] Completed in ${duration}ms`, {
      recoveredRounds: recoveredRounds.length,
      alertsSent: alertsSent.length,
    });

    return createSuccessResponse({
      recoveredRounds,
      alertsSent: alertsSent.length,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    cronLogger.error(`[Job 6] Failed after ${duration}ms`, error);
    return handleApiError(error);
  }
}
```

### Service Layer

```typescript
/**
 * CALCULATING 상태가 10분 이상 지속된 라운드 찾기
 */
async findStuckRounds(): Promise<Round[]> {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

  return this.db
    .select()
    .from(rounds)
    .where(
      and(
        eq(rounds.status, 'CALCULATING'),
        lte(rounds.settlementStartedAt, tenMinutesAgo)
      )
    )
    .orderBy(asc(rounds.settlementStartedAt));
}

/**
 * 미정산 베팅 찾기
 */
async findPendingBets(roundId: string): Promise<Bet[]> {
  return this.db
    .select()
    .from(bets)
    .where(
      and(
        eq(bets.roundId, roundId),
        inArray(bets.settlementStatus, ['PENDING', 'FAILED'])
      )
    );
}

/**
 * 재시도 카운트 증가
 */
async incrementRetryCount(roundId: string): Promise<number> {
  const round = await this.findRoundById(roundId);
  const newCount = (round.settlementRetryCount || 0) + 1;

  await this.db
    .update(rounds)
    .set({ settlementRetryCount: newCount })
    .where(eq(rounds.id, roundId));

  return newCount;
}
```

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

    expect(result).toBe('GOLD');
  });

  it('should return DRAW when change difference < 0.01%', () => {
    const result = determineWinner({
      goldStart: 2650,
      goldEnd: 2652.65, // +0.10%
      btcStart: 98000,
      btcEnd: 98098, // +0.10%
    });

    expect(result).toBe('DRAW');
  });
});

describe('calculatePayout', () => {
  it('should calculate correct payout ratio', () => {
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
  });

  it('should return 1:1 ratio for DRAW', () => {
    const result = calculatePayout({
      winner: 'DRAW',
      totalPool: 1000000,
      totalGoldBets: 600000,
      totalBtcBets: 400000,
      platformFeeRate: 0.05,
    });

    expect(result.platformFee).toBe(0); // 무승부는 수수료 없음
    expect(result.payoutPool).toBe(1000000);
    expect(result.payoutRatio).toBe(1.0);
  });
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

- [ ] lib/cron/auth.ts - Cron Secret 검증
- [ ] lib/cron/logger.ts - Cron 전용 로거
- [ ] lib/rounds/fsm.ts - 상태 전이 로직
- [ ] lib/rounds/calculator.ts - 승자 판정, 배당 계산
- [ ] app/api/cron/rounds/create/route.ts - Job 1
- [ ] app/api/cron/rounds/open/route.ts - Job 2 (Mock 가격)
- [ ] app/api/cron/rounds/lock/route.ts - Job 3
- [ ] Postman으로 수동 테스트

**Week 2 (Sui 통합)**:

- [ ] app/api/cron/rounds/finalize/route.ts - Job 4 (실제 가격)
- [ ] app/api/cron/rounds/settle/route.ts - Job 5 (Sui 호출)
- [ ] app/api/cron/recovery/route.ts - Job 6
- [ ] lib/cron/slack.ts - Slack 알림

**Week 3 (배포)**:

- [ ] wrangler.toml Cron 설정
- [ ] WebSocket 이벤트 발행
- [ ] E2E 테스트

### 중요 포인트

1. **멱등성**: 같은 Job을 여러 번 실행해도 안전
2. **재시도**: 실패 시 자동 재시도 (최대 3회)
3. **복구**: 서버 재시작 시 미완료 라운드 자동 복구
4. **모니터링**: Slack 알림으로 Critical 에러 즉시 감지
5. **테스트**: Postman으로 수동 테스트 → E2E 자동화

---
