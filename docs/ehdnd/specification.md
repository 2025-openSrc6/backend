# 🎯 deltaX 6시간 라운드 시스템 구체화 명세

## 📋 목차

1. [6시간 라운드 타임라인 & 규칙](#1-6시간-라운드-타임라인--규칙)
2. [가격 스냅샷 전략](#2-가격-스냅샷-전략)
3. [동시성 제어 (SQLite 특성)](#3-동시성-제어-sqlite-특성)
4. [라운드 상태 전이 (FSM)](#4-라운드-상태-전이-fsm)
5. [실패 케이스 처리](#5-실패-케이스-처리)
6. [Sui 통합 전략 (핵심!)](#6-sui-통합-전략-핵심)
7. [Cron Job 설계](#7-cron-job-설계)

---

## 1. 6시간 라운드 타임라인 & 규칙

### 1.1 라운드 시간표 (하루 4회)

```
라운드 1: 02:00 ~ 08:00 KST (6시간)
라운드 2: 08:00 ~ 14:00 KST
라운드 3: 14:00 ~ 20:00 KST
라운드 4: 20:00 ~ 02:00 KST (다음날)

서버 타임존: UTC (KST = UTC+9)
→ 라운드 1: 17:00 ~ 23:00 UTC (전날)
→ 라운드 2: 23:00 ~ 05:00 UTC
→ 라운드 3: 05:00 ~ 11:00 UTC
→ 라운드 4: 11:00 ~ 17:00 UTC
```

### 1.2 베팅 가능 시간 (라운드 시작 후 1분)

```
예시: 라운드 3 (14:00 ~ 20:00 KST)

T-00:10:00  (13:50) | [SCHEDULED] 라운드 생성, UI에 표시
                     | → 유저가 미리 확인 가능
                     | → "10분 후 시작" 타이머

T-00:00:00  (14:00) | [BETTING_OPEN] 라운드 시작
                     | → Start Price 스냅샷 (gold_start_price, btc_start_price)
                     | → 베팅 시작 가능
                     | → 프론트엔드: "베팅 가능" 버튼 활성화

T+00:00:50  (14:00:50) | [경고] 10초 후 베팅 마감
                        | → UI: 빨간색 경고 표시
                        | → WebSocket: "마감 임박" 브로드캐스트

T+00:01:00  (14:01) | [BETTING_LOCKED] 베팅 마감
                     | → 더 이상 베팅 불가
                     | → 프론트엔드: 버튼 비활성화
                     | → DB: status = 'BETTING_LOCKED'

T+06:00:00  (20:00) | [PRICE_PENDING] 라운드 종료
                     | → End Price 스냅샷 (gold_end_price, btc_end_price)
                     | → 승자 판정 시작

T+06:00:30  (20:00:30) | [CALCULATING] 배당 계산 시작
                        | → 풀 분배 계산
                        | → Sui 정산 트랜잭션 준비

T+06:01:00  (20:01) | [SETTLED] 정산 완료
                     | → 승자들에게 배당금 지급 (Sui)
                     | → DB 업데이트
```

### 1.3 베팅 마감 정책 (Hard Lock)

**문제 상황:**

```
사용자가 14:00:59.8초에 베팅 버튼 클릭
→ 네트워크 지연 200ms
→ 서버 도착 14:01:00.0초
→ 이 베팅은?
```

**해결책 (3단계 검증):**

```
[1단계] 프론트엔드 검증 (Soft Lock)
- T+00:00:55 (14:00:55)부터 버튼 비활성화
- 이유: 네트워크 지연 5초 버퍼

[2단계] Next.js API 검증 (Business Logic)
- POST /api/bets 도착 시각 확인
- 현재 시각이 T+00:01:00 이후면 → 400 Error 반환
- 에러 메시지: "베팅 시간이 종료되었습니다"

[3단계] DB 제약 조건 (Data Integrity)
- WHERE 절에 status 검증 포함:
  INSERT INTO bets (...)
  WHERE round.status = 'BETTING_OPEN'

- 만약 status가 'BETTING_LOCKED'면 삽입 실패
- 원자성 보장 (Atomic)
```

**베팅 타임스탬프 기록:**

```
bets 테이블:
- created_at: 베팅 요청 시각 (클라이언트)
- processed_at: 서버 처리 시각 (서버 타임스탬프)
- sui_tx_timestamp: Sui 트랜잭션 완료 시각

→ 분쟁 발생 시 processed_at이 기준
→ 감사 추적 (Audit Trail) 가능
```

---

## 2. 가격 스냅샷 전략

### 2.1 현준님 API 인터페이스 (가정)

```typescript
// 현준님이 제공하는 함수 (lib/prices/fetcher.ts)
export async function getPrices(): Promise<{
  gold: number; // USD/oz (예: 2650.50)
  btc: number; // USD (예: 98234.00)
  timestamp: Date; // 가격 조회 시각
  source: 'kitco' | 'coingecko' | 'average'; // 소스 정보
}>;

// 사용 예시
const prices = await getPrices();
// { gold: 2650.50, btc: 98234.00, timestamp: 2025-11-15T14:00:02Z, source: 'kitco' }
```

### 2.2 스냅샷 시점 & 정책

**라운드 시작 시 (T+00:00:00):**

```
[정책]
1. 현준님 API 우선 호출
2. 타임아웃: 5초
3. 실패 시 Fallback 전략

[타임라인]
14:00:00.000 | Cron Job 트리거
14:00:00.100 | getPrices() 호출
14:00:00.500 | 응답 수신 (성공)
             | → gold_start_price = 2650.50
             | → btc_start_price = 98234.00
             | → snapshot_timestamp = 2025-11-15T05:00:00.500Z (UTC)
14:00:00.600 | DB 업데이트
             | UPDATE rounds SET
             |   gold_start_price = 2650.50,
             |   btc_start_price = 98234.00,
             |   price_snapshot_start_at = '2025-11-15T05:00:00.500Z',
             |   status = 'BETTING_OPEN'
             | WHERE id = ?
```

**라운드 종료 시 (T+06:00:00):**

```
동일한 로직으로 gold_end_price, btc_end_price 저장
```

### 2.3 Fallback 정책 (API 실패 시)

**시나리오 1: 타임아웃 (5초 초과)**

```
[옵션 A] 마지막 성공 가격 사용 (추천)
- Redis에 캐시된 최신 가격 조회
  → key: "price:gold:latest", "price:btc:latest"
  → TTL: 10분
- 조건: 마지막 가격이 10분 이내
- 경고 로그 기록: "Using fallback price (stale)"

[옵션 B] 라운드 지연 시작
- status = 'DELAYED'로 변경
- 1분 후 재시도
- 3회 실패 시 → 라운드 취소

[선택] 옵션 A (마지막 성공 가격)
- 이유: 6시간 라운드는 1-2분 가격 차이 무시 가능
- 10분 이상 오래된 가격이면 → 옵션 B로 전환
```

**시나리오 2: Critical Failure (Redis도 없음)**

```
[정책] 라운드 취소 + 베팅 환불

1. status = 'CANCELLED'로 변경
2. 이미 베팅한 유저들에게 환불:
   - Sui Lock된 자금 즉시 Unlock
   - 또는 DB에만 기록된 경우 → 잔액 복구
3. UI 공지: "시스템 오류로 라운드가 취소되었습니다"
4. 알림 발송: Slack/Discord 등 관리자 채널
```

### 2.4 가격 데이터 신뢰성 검증

**현준님 API가 이상한 값을 반환하면?**

```typescript
// 검증 로직
function validatePrice(prices: PriceData): boolean {
  // 1. Null/Undefined 체크
  if (!prices.gold || !prices.btc) return false;

  // 2. 범위 검증 (상식선)
  const GOLD_MIN = 1000,
    GOLD_MAX = 5000; // USD/oz
  const BTC_MIN = 10000,
    BTC_MAX = 200000; // USD

  if (prices.gold < GOLD_MIN || prices.gold > GOLD_MAX) return false;
  if (prices.btc < BTC_MIN || prices.btc > BTC_MAX) return false;

  // 3. 변동성 검증 (마지막 가격 대비 ±20% 초과 시 의심)
  const lastGold = await redis.get('price:gold:last_valid');
  if (lastGold) {
    const change = Math.abs(prices.gold - lastGold) / lastGold;
    if (change > 0.2) {
      // 경고 로그 + 재확인 필요
      console.warn(`Abnormal price change: ${change * 100}%`);
      // → Fallback으로 전환
      return false;
    }
  }

  return true;
}
```

---

## 3. 동시성 제어 (SQLite 특성)

### 3.1 SQLite의 동시성 한계

**중요한 특징:**

```
SQLite는 단일 Writer Lock을 사용합니다.

[문제]
- 동시에 2개 이상의 쓰기(INSERT/UPDATE) 요청 → 하나만 처리, 나머지 대기
- 타임아웃 발생 가능 (기본 5초)

[장점]
- 매우 간단함 (복잡한 락 메커니즘 불필요)
- 데이터 무결성 자동 보장

[결론]
- 베팅이 초당 100건 이하면 문제 없음
- 유저 수가 적다면 SQLite로 충분
```

### 3.2 풀 금액 업데이트 전략

**❌ 잘못된 방법 (Race Condition):**

```sql
-- 두 유저가 동시에 베팅하면 문제 발생

[User A] SELECT total_pool FROM rounds WHERE id = ?
         → total_pool = 10000

[User B] SELECT total_pool FROM rounds WHERE id = ?
         → total_pool = 10000 (동일!)

[User A] UPDATE rounds SET total_pool = 10100 WHERE id = ?
         → total_pool = 10100

[User B] UPDATE rounds SET total_pool = 10200 WHERE id = ?
         → total_pool = 10200 ❌ (User A 베팅 누락!)
```

**✅ 올바른 방법 (Atomic Update):**

```sql
-- SQLite의 원자적 연산 사용

UPDATE rounds
SET
  total_gold_bets = total_gold_bets + CASE WHEN :prediction = 'GOLD' THEN :amount ELSE 0 END,
  total_btc_bets = total_btc_bets + CASE WHEN :prediction = 'BTC' THEN :amount ELSE 0 END,
  total_pool = total_pool + :amount,
  updated_at = CURRENT_TIMESTAMP
WHERE id = :round_id
  AND status = 'BETTING_OPEN'
RETURNING *;

-- 설명:
-- 1. SELECT 없이 바로 UPDATE (원자성)
-- 2. 현재 값 + 증분 (total_pool = total_pool + amount)
-- 3. RETURNING으로 업데이트된 값 확인
-- 4. status 검증으로 마감된 라운드 차단
```

**Drizzle ORM 버전:**

```typescript
// lib/rounds/bet-handler.ts (로직 명세)

베팅 처리 시:
1. 트랜잭션 시작
2. 라운드 상태 확인 (status = 'BETTING_OPEN')
3. Atomic UPDATE:
   - total_gold_bets 증가 (GOLD 베팅 시)
   - total_btc_bets 증가 (BTC 베팅 시)
   - total_pool 증가 (항상)
4. 베팅 레코드 삽입 (bets 테이블)
5. 커밋

실패 시:
- 자동 롤백 (트랜잭션)
- 에러 반환: { success: false, error: "라운드 마감됨" }
```

### 3.3 SQLite 설정 최적화

```
WAL (Write-Ahead Logging) 모드 활성화:
- 읽기/쓰기 동시 수행 가능
- 성능 향상 (특히 Cloudflare D1)

설정:
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = MEMORY;

→ Cloudflare D1은 이미 최적화되어 있음
```

---

## 4. 라운드 상태 전이 (FSM)

### 4.1 상태 정의 (확정)

```typescript
enum RoundStatus {
  SCHEDULED = 'SCHEDULED', // 생성됨, 10분 전
  BETTING_OPEN = 'BETTING_OPEN', // 베팅 가능 (1분간)
  BETTING_LOCKED = 'BETTING_LOCKED', // 베팅 마감, 진행중 (5시간 59분)
  PRICE_PENDING = 'PRICE_PENDING', // 종료, 가격 스냅샷 대기중
  CALCULATING = 'CALCULATING', // 승자 판정 + 배당 계산중
  SETTLED = 'SETTLED', // 정산 완료 (종료 상태)
  CANCELLED = 'CANCELLED', // 취소됨 - 환불 (종료 상태)
  VOIDED = 'VOIDED', // 무효화 - 무승부 환불 (종료 상태)
}
```

### 4.2 상태 전이 다이어그램

```
                        ┌─────────────┐
                        │  SCHEDULED  │ (T-10분)
                        └──────┬──────┘
                               │ Cron: 라운드 시작
                               ↓
                        ┌─────────────┐
                   ┌────│BETTING_OPEN │ (T+0초 ~ T+1분)
                   │    └──────┬──────┘
                   │           │ Cron: 베팅 마감 OR 1분 경과
                   │           ↓
                   │    ┌──────────────┐
                   │    │BETTING_LOCKED│ (T+1분 ~ T+6시간)
                   │    └──────┬───────┘
                   │           │ Cron: 라운드 종료 (6시간 도달)
                   │           ↓
                   │    ┌──────────────┐
                   │    │PRICE_PENDING │ (End Price 스냅샷)
                   │    └──────┬───────┘
                   │           │ 가격 확보 완료
                   │           ↓
                   │    ┌──────────────┐
                   │    │ CALCULATING  │ (승자 판정, 배당 계산)
                   │    └──┬───────┬───┘
                   │       │       │
                   │       │       └─────────┐
                   │       │                 │
        [가격 실패]│       │[정상]           │[무승부]
                   │       ↓                 ↓
                   │  ┌─────────┐      ┌─────────┐
                   └──│CANCELLED│      │ VOIDED  │
                      └─────────┘      └─────────┘
                          ↑                 ↑
                          │                 │
                     ┌────┴─────────────────┘
                     │ 종료 상태 (더 이상 전이 없음)
                     └─────────┐
                               ↓
                          ┌─────────┐
                          │ SETTLED │ (최종 성공)
                          └─────────┘
```

### 4.3 전이 규칙 (Transition Rules)

```typescript
// 허용된 전이만 정의
const ALLOWED_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  SCHEDULED: ['BETTING_OPEN', 'CANCELLED'],
  BETTING_OPEN: ['BETTING_LOCKED', 'CANCELLED'],
  BETTING_LOCKED: ['PRICE_PENDING', 'CANCELLED'],
  PRICE_PENDING: ['CALCULATING', 'CANCELLED'],
  CALCULATING: ['SETTLED', 'VOIDED', 'CANCELLED'],
  SETTLED: [], // 종료 상태
  CANCELLED: [], // 종료 상태
  VOIDED: [], // 종료 상태
};

// 전이 검증 함수
function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) || false;
}
```

### 4.4 각 전이의 트리거

```
SCHEDULED → BETTING_OPEN:
  트리거: Cron Job (매 라운드 시작 시각)
  작업:
    1. Start Price 스냅샷 (getPrices())
    2. gold_start_price, btc_start_price 저장
    3. status = 'BETTING_OPEN'
    4. WebSocket: "라운드 시작" 브로드캐스트

BETTING_OPEN → BETTING_LOCKED:
  트리거: Cron Job (시작 +1분)
  작업:
    1. status = 'BETTING_LOCKED'
    2. 더 이상 베팅 불가
    3. WebSocket: "베팅 마감" 브로드캐스트

BETTING_LOCKED → PRICE_PENDING:
  트리거: Cron Job (시작 +6시간)
  작업:
    1. End Price 스냅샷 (getPrices())
    2. gold_end_price, btc_end_price 저장
    3. status = 'PRICE_PENDING'

PRICE_PENDING → CALCULATING:
  트리거: 자동 (가격 스냅샷 성공 시)
  작업:
    1. 승자 판정 (금 vs 비트 비교)
    2. 배당 계산 (풀 분배)
    3. status = 'CALCULATING'

CALCULATING → SETTLED:
  트리거: 정산 완료 (Sui 트랜잭션 성공)
  작업:
    1. 모든 승자에게 배당금 지급
    2. settlement_completed_at 기록
    3. status = 'SETTLED'

* → CANCELLED:
  트리거: Critical Failure (가격 API 실패 등)
  작업:
    1. 모든 베팅 환불
    2. cancellation_reason 기록
    3. status = 'CANCELLED'

CALCULATING → VOIDED:
  트리거: 무승부 (금 == 비트 변동률)
  작업:
    1. 모든 베팅 환불 (수수료 없음)
    2. void_reason = 'DRAW'
    3. status = 'VOIDED'
```

---

## 5. 실패 케이스 처리

### 5.1 베팅 실패 시나리오 & 해결책

**시나리오 A: Sui 트랜잭션 실패**

```
[플로우]
1. 유저 베팅 요청: POST /api/bets
2. 백엔드 검증 통과
3. D1에 베팅 레코드 삽입 (status = 'PENDING')
4. Sui Lock 트랜잭션 전송
   ↓
   ❌ 실패 (네트워크 오류, 가스 부족 등)

[해결책 - 옵션 A: 즉시 롤백 (추천)]
1. D1에서 베팅 레코드 삭제
   DELETE FROM bets WHERE id = ?

2. 유저에게 에러 반환:
   {
     success: false,
     error: "블록체인 트랜잭션 실패. 다시 시도해주세요.",
     code: "SUI_TX_FAILED"
   }

3. 유저 잔액 변화 없음 (애초에 차감 안 됨)

[해결책 - 옵션 B: 재시도]
→ 복잡도 증가, Week 1에서는 제외

[선택] 옵션 A (즉시 롤백)
```

**올바른 순서 (자금 안전성 우선):**

```
잘못된 순서:
1. D1에 잔액 차감
2. Sui 트랜잭션 전송
3. Sui 실패 → 돈은 빠져나갔는데 베팅은 안 됨 ❌

올바른 순서:
1. Sui Lock 트랜잭션 먼저 전송 ✅
2. Sui 성공 확인 (tx_digest 수신)
3. D1에 베팅 레코드 저장 + tx_digest 기록
4. D1에 잔액 차감 (또는 Sui가 관리하므로 생략)

→ Sui 실패 시 아무것도 기록 안 됨 (안전)
```

**베팅 API 플로우 (정확한 순서):**

```
POST /api/bets 요청:

[1단계] 검증 (D1 읽기만)
- 라운드 상태 확인 (status = 'BETTING_OPEN')
- 유저 잔액 확인 (충분한지)
- 중복 베팅 확인 (이미 이 라운드에 베팅했는지)

[2단계] Sui 트랜잭션 (Critical Section)
- Sui Move Contract 호출: lock_bet()
- 파라미터:
  - round_id
  - user_address
  - prediction (GOLD or BTC)
  - amount
- 결과: tx_digest 반환
- 타임아웃: 10초
- 실패 시: 즉시 400 Error 반환 (DB 기록 없음)

[3단계] D1 기록 (Sui 성공 후에만)
BEGIN TRANSACTION;
  INSERT INTO bets (..., sui_tx_hash = tx_digest);
  UPDATE rounds SET total_pool = total_pool + amount WHERE id = ?;
COMMIT;

[4단계] 응답
{
  success: true,
  bet_id: "...",
  tx_hash: "0x...",
  message: "베팅이 완료되었습니다"
}
```

### 5.2 정산 중 서버 다운 복구

**문제 상황:**

```
라운드 종료 → 정산 시작
100명 베팅 → 50명 정산 완료
→ 서버 크래시 ☠️
→ 재시작 → 나머지 50명?
```

**해결책: 멱등성(Idempotency) 보장**

```
[원칙]
같은 정산 작업을 여러 번 실행해도 결과는 동일해야 함

[구현]
bets 테이블에 settlement_status 컬럼 추가:

settlement_status:
  - PENDING: 정산 대기 (기본값)
  - PROCESSING: 정산 진행중
  - COMPLETED: 정산 완료
  - FAILED: 정산 실패 (재시도 필요)
```

**복구 로직:**

```
서버 재시작 시:

[1단계] 미완료 라운드 찾기
SELECT * FROM rounds
WHERE status = 'CALCULATING'
  AND settlement_started_at IS NOT NULL
ORDER BY created_at ASC
LIMIT 10;

[2단계] 각 라운드별 미정산 베팅 찾기
SELECT * FROM bets
WHERE round_id = ?
  AND settlement_status IN ('PENDING', 'FAILED')
ORDER BY created_at ASC;

[3단계] 재정산 (멱등성 보장)
FOR EACH bet:
  BEGIN TRANSACTION;

  1. Status 변경: PENDING → PROCESSING
     UPDATE bets SET settlement_status = 'PROCESSING' WHERE id = ?;

  2. Sui 트랜잭션 전송 (승자에게만)
     IF bet.prediction = round.winner:
       - Transfer DEL to user
       - tx_digest 저장

  3. Status 완료: PROCESSING → COMPLETED
     UPDATE bets SET
       settlement_status = 'COMPLETED',
       payout = calculated_amount,
       settlement_tx_hash = tx_digest,
       settled_at = CURRENT_TIMESTAMP
     WHERE id = ?;

  COMMIT;

  실패 시:
    ROLLBACK;
    UPDATE bets SET settlement_status = 'FAILED' WHERE id = ?;
    → 다음 정산 사이클에서 재시도
```

**정산 완료 조건:**

```
라운드 정산 완료 기준:

SELECT COUNT(*) as total_bets,
       SUM(CASE WHEN settlement_status = 'COMPLETED' THEN 1 ELSE 0 END) as settled_count
FROM bets
WHERE round_id = ?;

IF total_bets = settled_count:
  UPDATE rounds SET
    status = 'SETTLED',
    settlement_completed_at = CURRENT_TIMESTAMP
  WHERE id = ?;
ELSE:
  → 계속 CALCULATING 상태 유지
  → Cron Job이 주기적으로 재시도
```

---

## 6. Sui 통합 전략 (핵심!)

### 6.1 투명성 vs 현실성 균형

**당신의 목표: "투명성"**

```
✅ 모든 베팅은 블록체인에 기록
✅ 정산 결과도 블록체인에 기록
✅ 누구나 검증 가능

→ Sui를 최대한 활용!
```

**현실적 제약:**

```
❌ 가스비 부담 (팀이 지불)
❌ 트랜잭션 속도 (~400ms)
❌ 구현 복잡도

→ 하지만 유저 적고, 6시간 라운드니까 괜찮다!
```

### 6.2 Sui 사용 범위 (확정안)

**✅ Sui에 기록할 것:**

```
1. 베팅 (Bet) - 모든 베팅은 Sui Object로 생성
   - 누가 (user_address)
   - 언제 (timestamp)
   - 얼마를 (amount)
   - 무엇에 (prediction: GOLD or BTC)
   - 베팅했는지

2. 라운드 정산 (Settlement) - 라운드 종료 시 1회
   - 시작 가격 (gold_start, btc_start)
   - 종료 가격 (gold_end, btc_end)
   - 승자 (winner)
   - 총 풀 (total_pool)
   - 각 팀별 풀 (gold_pool, btc_pool)
   - 배당 비율 (payout_ratio)

3. 정산 트랜잭션 (Payout) - 승자들에게
   - 각 승자에게 DEL 전송
   - payout_amount 기록
```

**❌ Sui에 기록 안 할 것 (D1에만):**

```
1. 유저 프로필 (users)
   - 닉네임, 이메일 등
   → 개인정보, 블록체인 불필요

2. 랭킹, 통계 (rankings, stats)
   → 집계 데이터, 실시간 변경

3. 임시 데이터 (캐시, 세션)
   → Redis 사용
```

### 6.3 데이터 흐름 (Hybrid 아키텍처)

```
[베팅 플로우]

1. 유저 베팅 버튼 클릭
   ↓
2. POST /api/bets (Next.js API)
   ↓
3. [D1] 검증 (라운드 상태, 잔액, 중복)
   ↓
4. [Sui] Bet Object 생성 + Lock
   - Move Contract: betting::place_bet()
   - 결과: bet_object_id, tx_digest
   ↓
5. [D1] 베팅 기록 저장
   - bets 테이블에 INSERT
   - sui_bet_object_id, sui_tx_hash 저장
   ↓
6. [Sui] DEL Balance 차감 (자동)
   - Move Contract가 처리
   ↓
7. 응답: { success: true, tx_hash }
```

```
[정산 플로우]

1. 라운드 종료 (Cron Job)
   ↓
2. [D1] End Price 스냅샷
   ↓
3. [D1] 승자 판정
   - 금 변동률 vs 비트 변동률
   ↓
4. [D1] 배당 계산
   - 풀 분배 비율 계산
   - 각 승자별 payout_amount 산출
   ↓
5. [Sui] Settlement Object 생성
   - Move Contract: settlement::finalize_round()
   - 라운드 정보 영구 기록
   ↓
6. [Sui] 승자들에게 배당 전송
   - FOR EACH 승자:
     - transfer::public_transfer(DEL, winner_address, amount)
   ↓
7. [D1] 정산 완료 기록
   - bets.settlement_status = 'COMPLETED'
   - rounds.status = 'SETTLED'
```

### 6.4 Sui Move 컨트랙트 구조 (개념)

**Module 1: betting.move**

```
역할: 베팅 생성 및 자금 Lock

Struct Bet {
  id: UID,
  round_id: u64,
  user: address,
  prediction: u8,  // 1 = GOLD, 2 = BTC
  amount: u64,
  timestamp: u64,
  locked: bool
}

Function place_bet(
  round_id: u64,
  user: &signer,
  prediction: u8,
  amount: Coin<DEL>
): Bet {
  // 1. DEL 코인을 Contract가 보관
  // 2. Bet Object 생성
  // 3. Emit Event: BetPlaced
  // 4. Return Bet Object ID
}

Function unlock_bet(bet: &mut Bet, recipient: address) {
  // 정산 시 호출
  // locked = false로 변경
  // DEL 전송
}
```

**Module 2: settlement.move**

```
역할: 라운드 정산 기록

Struct Settlement {
  id: UID,
  round_id: u64,
  gold_start: u64,
  gold_end: u64,
  btc_start: u64,
  btc_end: u64,
  winner: u8,  // 1 = GOLD, 2 = BTC, 3 = DRAW
  total_pool: u64,
  gold_pool: u64,
  btc_pool: u64,
  payout_ratio: u64,  // 승자 1인당 배당 비율
  timestamp: u64
}

Function finalize_round(
  round_id: u64,
  prices: PriceData,
  admin: &signer
): Settlement {
  // 1. 승자 판정
  // 2. Settlement Object 생성
  // 3. Emit Event: RoundFinalized
  // 4. Return Settlement Object ID
}

Function distribute_payouts(
  settlement: &Settlement,
  bets: vector<Bet>,
  admin: &signer
) {
  // 1. 승자 필터링
  // 2. 각 승자에게 배당 전송
  // 3. Emit Event: PayoutDistributed
}
```

**Module 3: del_coin.move**

```
역할: DEL 재화 관리

Struct DEL has drop {}  // One-Time Witness

Function init(otw: DEL, ctx: &mut TxContext) {
  // TreasuryCap 생성
  // CoinMetadata 설정
}

Function mint(
  treasury: &mut TreasuryCap<DEL>,
  amount: u64,
  ctx: &mut TxContext
): Coin<DEL> {
  // Admin만 호출 가능
  // 출석 보상, 정산 등에 사용
}

Function burn(...) {
  // 소각 (필요 시)
}
```

### 6.5 가스비 관리 전략

**문제:**

```
유저가 DEL로 베팅하지만,
Sui 가스비는 SUI 코인으로 지불해야 함

→ 유저가 SUI를 보유해야 함? (UX 나쁨)
→ 팀이 대신 지불? (비용 부담)
```

**해결책 (Sponsored Transaction - 추천):**

```
Sui는 "Sponsored Transaction" 지원:
→ 가스비를 제3자(Sponsor)가 대신 지불

[구현]
1. 팀이 Admin Wallet 생성
   - SUI 충전 (1000 SUI 정도)

2. 모든 베팅 트랜잭션을 Sponsor로 전송
   - 유저: DEL만 필요
   - Admin Wallet: 가스비 지불 (SUI)

3. 백엔드에서 처리:
   const tx = new TransactionBlock();
   tx.moveCall({
     target: `${PACKAGE_ID}::betting::place_bet`,
     arguments: [...]
   });

   // Admin Keypair로 Sponsor
   await suiClient.signAndExecuteTransactionBlock({
     transactionBlock: tx,
     signer: adminKeypair,  // 팀의 지갑
     options: { showEffects: true }
   });

[비용 산정]
- 베팅 1회: ~0.001 SUI (~$0.002)
- 하루 100 베팅: 0.1 SUI
- 월간 3000 베팅: 3 SUI (~$6)

→ 유저 수 적으면 감당 가능!
```

### 6.6 D1 vs Sui 동기화 전략

**원칙: Sui가 Source of Truth**

```
D1 (SQLite):
- 빠른 조회용 캐시
- 집계/통계
- UI 렌더링

Sui Blockchain:
- 불변 기록 (Immutable)
- 감사 추적 (Audit Trail)
- 분쟁 해결 시 최종 증거
```

**동기화 방법:**

```
[방법 1] 실시간 동기화 (베팅 시)
1. Sui 트랜잭션 전송
2. 성공 시 D1에 기록
3. sui_tx_hash, sui_object_id 저장

→ D1 데이터는 Sui의 복사본

[방법 2] 주기적 검증 (하루 1회)
1. D1에서 모든 베팅 조회
2. Sui에서 같은 베팅 조회 (sui_object_id로)
3. 불일치 발견 시 알림
4. Sui 데이터를 기준으로 D1 수정

→ 데이터 무결성 보장
```

**검증 스크립트 (로직):**

```
매일 03:00 실행 (Cron):

1. 어제 정산된 라운드 조회
   SELECT * FROM rounds
   WHERE status = 'SETTLED'
     AND settlement_completed_at >= YESTERDAY;

2. 각 라운드별 Sui Settlement Object 조회
   const settlement = await suiClient.getObject({
     id: round.sui_settlement_object_id,
     options: { showContent: true }
   });

3. 비교:
   - D1.winner vs Sui.winner
   - D1.total_pool vs Sui.total_pool
   - D1.payout vs Sui.payout_ratio

4. 불일치 시:
   - Slack 알림: "데이터 불일치 발견!"
   - 수동 확인 필요
   - Sui 데이터가 정답 (D1 수정)
```

---

## 7. Cron Job 설계

### 7.1 Job 분리 (Separation of Concerns)

**6개 Job으로 역할 분담:**

```
Job 1: Round Creator (매일 특정 시각 실행)
  실행 시각: 01:50, 07:50, 13:50, 19:50 KST (각 라운드 10분 전)
  역할: 다음 라운드 미리 생성
  로직:
    1. 다음 라운드 시간 계산
    2. rounds 테이블에 INSERT
    3. status = 'SCHEDULED'
    4. WebSocket: "곧 라운드 시작" 알림

Job 2: Round Opener (매일 특정 시각 실행)
  실행 시각: 02:00, 08:00, 14:00, 20:00 KST (라운드 시작)
  역할: 라운드 시작 + Start Price 스냅샷
  로직:
    1. SCHEDULED 라운드 찾기
    2. getPrices() 호출
    3. gold_start_price, btc_start_price 저장
    4. status = 'BETTING_OPEN'
    5. WebSocket: "베팅 시작" 브로드캐스트

Job 3: Betting Locker (매일 특정 시각 실행)
  실행 시각: 02:01, 08:01, 14:01, 20:01 KST (시작 +1분)
  역할: 베팅 마감
  로직:
    1. BETTING_OPEN 라운드 찾기 (1분 경과)
    2. status = 'BETTING_LOCKED'
    3. WebSocket: "베팅 마감" 알림

Job 4: Round Finalizer (매일 특정 시각 실행)
  실행 시각: 08:00, 14:00, 20:00, 02:00 KST (각 라운드 종료)
  역할: 라운드 종료 + End Price 스냅샷
  로직:
    1. BETTING_LOCKED 라운드 찾기 (6시간 경과)
    2. getPrices() 호출
    3. gold_end_price, btc_end_price 저장
    4. 승자 판정:
       gold_change = (gold_end - gold_start) / gold_start
       btc_change = (btc_end - btc_start) / btc_start

       IF gold_change > btc_change: winner = 'GOLD'
       ELSE IF btc_change > gold_change: winner = 'BTC'
       ELSE: winner = 'DRAW'  → VOIDED
    5. status = 'CALCULATING'
    6. Settlement Job 트리거

Job 5: Settlement Processor (큐 기반, 비동기)
  트리거: Job 4가 라운드를 CALCULATING으로 변경 시
  역할: 배당 계산 + Sui 정산
  로직:
    1. CALCULATING 라운드 조회
    2. 배당 계산:
       IF winner = 'DRAW':
         → 모두 환불 (수수료 없음)
         → status = 'VOIDED'
       ELSE:
         winning_pool = (winner == 'GOLD') ? total_gold_bets : total_btc_bets
         platform_fee = total_pool * 0.05
         payout_pool = total_pool - platform_fee

         FOR EACH 승자:
           payout = (bet.amount / winning_pool) * payout_pool

    3. Sui Settlement Object 생성
    4. Sui Payout 전송 (각 승자에게)
    5. D1 업데이트:
       - bets.settlement_status = 'COMPLETED'
       - bets.payout = calculated_amount
       - rounds.status = 'SETTLED'

Job 6: Recovery & Monitoring (1분마다 실행)
  역할: 실패한 정산 재시도
  로직:
    1. 10분 이상 CALCULATING 상태인 라운드 찾기
    2. 미정산 베팅 재처리
    3. 3회 실패 시 알림 → 수동 개입
```

### 7.2 Cloudflare Workers Cron 설정

```typescript
// wrangler.toml

[triggers]
crons = [
  # Job 1: Round Creator (10분 전)
  "50 17,23,5,11 * * *",  # UTC 기준 (KST -9시간)

  # Job 2: Round Opener (라운드 시작)
  "0 17,23,5,11 * * *",

  # Job 3: Betting Locker (시작 +1분)
  "1 17,23,5,11 * * *",

  # Job 4: Round Finalizer (라운드 종료)
  "0 23,5,11,17 * * *",

  # Job 6: Recovery (매분)
  "* * * * *"
]
```

### 7.3 Cron Job 실패 처리

**Job 실행 지연 시:**

```
예상 실행: 14:00:00
실제 실행: 14:00:03 (3초 지연)

→ 영향:
  - Start Price 스냅샷이 3초 늦음
  - 하지만 6시간 라운드니까 무시 가능

→ 조치:
  - 로그에 지연 기록
  - 5초 이상 지연 시 알림
```

**Job 실행 실패 시:**

```
14:00:00 Job 2 실행 시도
→ 에러 발생 (DB 연결 실패 등)

→ 복구:
  1. Cloudflare Workers는 자동 재시도 (3회)
  2. 모두 실패 시 → Job 6 (Recovery)이 처리
  3. Recovery도 실패 시 → Slack 알림
```
