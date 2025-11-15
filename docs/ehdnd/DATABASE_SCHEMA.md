# DATABASE_SCHEMA.md

deltaX 베팅 시스템의 데이터베이스 스키마 및 Sui 블록체인 객체 정의

---

## 📋 목차

1. [개요](#개요)
2. [D1 (SQLite) 스키마](#d1-sqlite-스키마)
3. [Sui Move Objects](#sui-move-objects)
4. [데이터 동기화 전략](#데이터-동기화-전략)
5. [인덱스 및 최적화](#인덱스-및-최적화)
6. [마이그레이션 전략](#마이그레이션-전략)

---

## 개요

### 아키텍처 원칙

**하이브리드 데이터 레이어**
- **D1 (SQLite)**: 빠른 조회, 집계, 실시간 데이터
- **Sui Blockchain**: 불변 기록, 감사 추적, 분쟁 해결

**데이터 흐름**
```
┌─────────────┐         ┌─────────────┐
│  Sui Chain  │ ──────> │  D1 Cache   │
│ (Source of  │  동기화  │ (Query      │
│  Truth)     │ <────── │  Layer)     │
└─────────────┘         └─────────────┘
     영구 기록             임시 캐시
```

### 네이밍 규칙

- **DB 컬럼**: `snake_case` (예: `round_id`, `created_at`)
- **TypeScript 속성**: `camelCase` (예: `roundId`, `createdAt`)
- **Sui Objects**: `PascalCase` (예: `BettingPool`, `Settlement`)

---

## D1 (SQLite) 스키마

### 1. users 테이블

**목적**: 유저 기본 정보 및 잔액 관리

```sql
CREATE TABLE users (
  -- 식별자
  id TEXT PRIMARY KEY,                    -- UUID v4
  sui_address TEXT NOT NULL UNIQUE,       -- Sui 지갑 주소 (0x...)
  
  -- 프로필
  nickname TEXT,                          -- 닉네임 (NULL = 기본: 주소 일부)
  profile_color TEXT DEFAULT '#3B82F6',   -- 프로필 색상
  
  -- 재화
  del_balance INTEGER NOT NULL DEFAULT 0,      -- del 재화 (정수, 1 del = 1)
  crystal_balance INTEGER NOT NULL DEFAULT 0,  -- 크리스탈 재화
  
  -- 통계
  total_bets INTEGER NOT NULL DEFAULT 0,       -- 총 베팅 횟수
  total_wins INTEGER NOT NULL DEFAULT 0,       -- 총 승리 횟수
  total_volume INTEGER NOT NULL DEFAULT 0,     -- 총 베팅 금액
  
  -- 출석
  last_attendance_at INTEGER,             -- 마지막 출석 시각 (Unix timestamp)
  attendance_streak INTEGER DEFAULT 0,    -- 연속 출석일
  
  -- 메타데이터
  created_at INTEGER NOT NULL,            -- Unix timestamp
  updated_at INTEGER NOT NULL,
  
  -- 제약 조건
  CHECK (del_balance >= 0),
  CHECK (crystal_balance >= 0),
  CHECK (total_bets >= 0),
  CHECK (total_wins >= 0 AND total_wins <= total_bets)
);

CREATE INDEX idx_users_sui_address ON users(sui_address);
CREATE INDEX idx_users_created_at ON users(created_at);
```

**Drizzle ORM 예시** (코드 구현 시 참고)
```typescript
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  suiAddress: text('sui_address').notNull().unique(),
  nickname: text('nickname'),
  delBalance: integer('del_balance').notNull().default(0),
  // ... 생략
});
```

---

### 2. rounds 테이블

**목적**: 베팅 라운드 정보 및 FSM 상태 관리

```sql
CREATE TABLE rounds (
  -- 식별자
  id TEXT PRIMARY KEY,                    -- UUID v4
  round_number INTEGER NOT NULL,          -- 라운드 번호 (1, 2, 3, ...)
  
  -- 라운드 타입
  type TEXT NOT NULL CHECK (type IN ('1MIN', '6HOUR', '1DAY')),
  
  -- 시간
  start_time INTEGER NOT NULL,            -- 라운드 시작 시각
  end_time INTEGER NOT NULL,              -- 라운드 종료 시각
  lock_time INTEGER NOT NULL,             -- 베팅 마감 시각 (start + 1분)
  
  -- FSM 상태
  status TEXT NOT NULL CHECK (status IN (
    'SCHEDULED',
    'BETTING_OPEN',
    'BETTING_LOCKED',
    'PRICE_PENDING',
    'CALCULATING',
    'SETTLED',
    'CANCELLED',
    'VOIDED'
  )),
  
  -- 가격 스냅샷 (TEXT로 저장, 정밀도 유지)
  gold_start_price TEXT,                  -- 금 시작가 (USD/oz, 예: "2650.50")
  gold_end_price TEXT,                    -- 금 종료가
  btc_start_price TEXT,                   -- BTC 시작가 (USD, 예: "98234.00")
  btc_end_price TEXT,                     -- BTC 종료가
  start_price_source TEXT CHECK (start_price_source IN ('kitco', 'coingecko', 'average', 'fallback', NULL)),
  start_price_is_fallback INTEGER NOT NULL DEFAULT 0 CHECK (start_price_is_fallback IN (0, 1)),
  start_price_fallback_reason TEXT,
  end_price_source TEXT CHECK (end_price_source IN ('kitco', 'coingecko', 'average', 'fallback', NULL)),
  end_price_is_fallback INTEGER NOT NULL DEFAULT 0 CHECK (end_price_is_fallback IN (0, 1)),
  end_price_fallback_reason TEXT,
  price_snapshot_start_at INTEGER,        -- 시작 스냅샷 시각
  price_snapshot_end_at INTEGER,          -- 종료 스냅샷 시각

  -- 변동률 (백분율, TEXT, 예: "1.125" = 1.125%)
  gold_change_percent TEXT,
  btc_change_percent TEXT,
  
  -- 베팅 풀
  total_pool INTEGER NOT NULL DEFAULT 0,       -- 총 베팅 금액
  total_gold_bets INTEGER NOT NULL DEFAULT 0,  -- 금 베팅 총액
  total_btc_bets INTEGER NOT NULL DEFAULT 0,   -- BTC 베팅 총액
  total_bets_count INTEGER NOT NULL DEFAULT 0, -- 총 베팅 수
  
  -- 승자
  winner TEXT CHECK (winner IN ('GOLD', 'BTC', 'DRAW', NULL)),
  
  -- 플랫폼 수수료
  platform_fee_rate TEXT DEFAULT '0.05',  -- 수수료율 (5% = "0.05")
  platform_fee_collected INTEGER DEFAULT 0,
  
  -- Sui 통합
  sui_pool_address TEXT,                  -- BettingPool Object ID
  sui_settlement_object_id TEXT,          -- Settlement Object ID
  
  -- 상태 전이 타임스탬프
  betting_opened_at INTEGER,
  betting_locked_at INTEGER,
  round_ended_at INTEGER,
  settlement_completed_at INTEGER,
  
  -- 메타데이터
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  -- 제약 조건
  CHECK (start_time < end_time),
  CHECK (lock_time > start_time AND lock_time < end_time),
  CHECK (total_pool = total_gold_bets + total_btc_bets)
);

CREATE INDEX idx_rounds_type_status ON rounds(type, status);
CREATE INDEX idx_rounds_start_time ON rounds(start_time);
CREATE INDEX idx_rounds_round_number ON rounds(round_number);
CREATE UNIQUE INDEX idx_rounds_type_round_number ON rounds(type, round_number);
```

**주요 필드 설명**
- `status`: FSM.md에 정의된 8가지 상태
- 가격은 `TEXT`로 저장하여 부동소수점 오차 방지
- `start_price_source` / `end_price_source`: 가격 데이터 제공자
- `*_is_fallback`, `*_fallback_reason`: Redis 캐시 사용, 지연 등 fallback 여부 판별
- 모든 금액은 정수 (1 del = 1, 소수점 없음)

---

### 3. bets 테이블

**목적**: 개별 베팅 기록

```sql
CREATE TABLE bets (
  -- 식별자
  id TEXT PRIMARY KEY,                    -- UUID v4
  round_id TEXT NOT NULL,                 -- 라운드 참조
  user_id TEXT NOT NULL,                  -- 유저 참조

  -- 베팅 내용
  prediction TEXT NOT NULL CHECK (prediction IN ('GOLD', 'BTC')),
  amount INTEGER NOT NULL,                -- 베팅 금액
  currency TEXT NOT NULL CHECK (currency IN ('DEL', 'CRYSTAL')),

  -- 정산 결과
  result_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    result_status IN ('PENDING', 'WON', 'LOST', 'REFUNDED', 'FAILED')
  ),
  settlement_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    settlement_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')
  ),
  payout_amount INTEGER DEFAULT 0,        -- 배당금 (승리 시)

  -- Sui 통합
  sui_bet_object_id TEXT,                 -- Bet Object ID
  sui_tx_hash TEXT,                       -- 베팅 트랜잭션 해시
  sui_payout_tx_hash TEXT,                -- 정산 트랜잭션 해시
  sui_tx_timestamp INTEGER,               -- 베팅 트랜잭션 블록 타임
  sui_payout_timestamp INTEGER,           -- 정산 트랜잭션 블록 타임

  -- 타임스탬프
  created_at INTEGER NOT NULL,            -- 베팅 요청 시각 (클라이언트)
  processed_at INTEGER NOT NULL,          -- 서버 처리 시각 (기준)
  settled_at INTEGER,                     -- 정산 완료 시각
  
  -- 외래키
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  -- 제약 조건
  CHECK (amount > 0),
  CHECK (payout_amount >= 0)
);

CREATE INDEX idx_bets_round_id ON bets(round_id);
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_settlement_status ON bets(settlement_status);
CREATE INDEX idx_bets_result_status ON bets(result_status);
CREATE INDEX idx_bets_created_at ON bets(created_at);
CREATE UNIQUE INDEX idx_bets_user_round ON bets(user_id, round_id);
```

**베팅 상태 흐름**
```
settlement_status:  PENDING → PROCESSING → COMPLETED
                                       ↓
                                    FAILED (재시도)

result_status:
  - PENDING  (정산 시작 전)
  - WON/LOST (승부 확정)
  - REFUNDED (무효/취소)
  - FAILED   (결과 확정 불가)
```

**추가 메모**
- `result_status`는 승/패 여부를 기록하며, `settlement_status`는 정산 파이프라인 진행 상황을 추적합니다.
- `sui_tx_timestamp` / `sui_payout_timestamp`는 온체인 블록 타임(Unix timestamp)을 저장해 감사 용도로 활용합니다.
- `(user_id, round_id)` UNIQUE 제약으로 동일 라운드 중복 베팅을 구조적으로 차단합니다.
- 실서비스는 DEL 기준으로 운영하며, CRYSTAL을 사용할 경우에도 1:1 환산 금액을 `amount`에 기록한 뒤 `currency = 'CRYSTAL'`로 표기해 감사 추적만 유지합니다.

---

### 4. price_snapshots 테이블

**목적**: 가격 이력 및 검증용

```sql
CREATE TABLE price_snapshots (
  id TEXT PRIMARY KEY,
  round_id TEXT,                          -- NULL이면 일반 스냅샷
  
  -- 가격 데이터
  gold_price TEXT NOT NULL,
  btc_price TEXT NOT NULL,
  
  -- 메타데이터
  source TEXT NOT NULL,                   -- 'kitco', 'coingecko', 'average'
  snapshot_type TEXT NOT NULL CHECK (
    snapshot_type IN ('START', 'END', 'GENERAL')
  ),
  
  -- 타임스탬프
  snapshot_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE SET NULL
);

CREATE INDEX idx_price_snapshots_round_id ON price_snapshots(round_id);
CREATE INDEX idx_price_snapshots_snapshot_at ON price_snapshots(snapshot_at);
CREATE INDEX idx_price_snapshots_type ON price_snapshots(snapshot_type);
```

**용도**
- 라운드 시작/종료 시 스냅샷 백업
- 가격 이상 감지 (변동성 검증)
- 감사 추적

---

### 5. settlements 테이블

**목적**: 정산 내역 추적

```sql
CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL UNIQUE,          -- 1:1 관계
  
  -- 정산 정보
  winner TEXT NOT NULL CHECK (winner IN ('GOLD', 'BTC', 'DRAW')),
  total_pool INTEGER NOT NULL,
  winning_pool INTEGER NOT NULL,          -- 승자 풀 금액
  losing_pool INTEGER NOT NULL,           -- 패자 풀 금액
  
  -- 수수료 및 배당
  platform_fee INTEGER NOT NULL,          -- 플랫폼 수수료
  payout_pool INTEGER NOT NULL,           -- 실제 배당 풀 (수수료 제외)
  payout_ratio TEXT NOT NULL,             -- 배당 비율 (예: "1.85")
  
  -- 통계
  total_winners INTEGER NOT NULL,         -- 승자 수
  total_losers INTEGER NOT NULL,          -- 패자 수
  
  -- Sui 통합
  sui_settlement_object_id TEXT,
  
  -- 타임스탬프
  calculated_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  
  CHECK (total_pool = winning_pool + losing_pool),
  CHECK (payout_pool = total_pool - platform_fee)
);

CREATE INDEX idx_settlements_round_id ON settlements(round_id);
CREATE INDEX idx_settlements_completed_at ON settlements(completed_at);
```

---

### 6. point_transactions 테이블

**목적**: 포인트/재화 거래 이력

```sql
CREATE TABLE point_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 거래 정보
  type TEXT NOT NULL CHECK (type IN (
    'DEPOSIT',           -- 입금
    'WITHDRAWAL',        -- 출금
    'BET_PLACED',        -- 베팅 (차감)
    'BET_WON',           -- 승리 (증가)
    'BET_REFUND',        -- 환불
    'ATTENDANCE',        -- 출석 보상
    'NFT_PURCHASE',      -- NFT 구매 (차감)
    'ADMIN_ADJUSTMENT'   -- 관리자 조정
  )),
  
  currency TEXT NOT NULL CHECK (currency IN ('DEL', 'CRYSTAL')),
  amount INTEGER NOT NULL,                -- 양수 = 증가, 음수 = 감소
  
  -- 잔액 스냅샷
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  
  -- 참조 (선택적)
  reference_id TEXT,                      -- bet_id, nft_id 등
  reference_type TEXT,                    -- 'BET', 'NFT', 'ROUND' 등
  
  -- 메모
  description TEXT,
  
  -- Sui 트랜잭션
  sui_tx_hash TEXT,
  
  -- 타임스탬프
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  CHECK (balance_after = balance_before + amount)
);

CREATE INDEX idx_point_tx_user_id ON point_transactions(user_id);
CREATE INDEX idx_point_tx_type ON point_transactions(type);
CREATE INDEX idx_point_tx_created_at ON point_transactions(created_at);
CREATE INDEX idx_point_tx_reference ON point_transactions(reference_type, reference_id);
```

**트랜잭션 예시**
```sql
-- 베팅 시 (차감)
INSERT INTO point_transactions VALUES (
  'uuid',
  'user123',
  'BET_PLACED',
  'DEL',
  -1000,              -- 차감
  5000,               -- 이전 잔액
  4000,               -- 이후 잔액
  'bet_uuid',
  'BET',
  '베팅: 라운드 #42',
  'sui_tx_hash',
  CURRENT_TIMESTAMP
);
```

---

### 7. achievements 테이블

**목적**: NFT 및 업적 관리

```sql
CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- NFT/업적 정보
  type TEXT NOT NULL CHECK (type IN ('NFT', 'BADGE', 'ACCESSORY')),
  tier TEXT CHECK (tier IN ('A', 'B', 'C', 'D', 'E', NULL)),
  name TEXT NOT NULL,
  description TEXT,
  
  -- 가격 (구매 시)
  purchase_price INTEGER,
  currency TEXT CHECK (currency IN ('DEL', 'CRYSTAL', NULL)),
  
  -- Sui NFT
  sui_nft_object_id TEXT,                 -- NFT Object ID
  ipfs_metadata_url TEXT,                 -- Pinata IPFS URL
  
  -- 메타데이터
  image_url TEXT,
  properties TEXT,                        -- JSON (색상, 효과 등)
  
  -- 타임스탬프
  acquired_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_achievements_user_id ON achievements(user_id);
CREATE INDEX idx_achievements_type ON achievements(type);
CREATE INDEX idx_achievements_tier ON achievements(tier);
```

---

### 8. round_transitions 테이블

**목적**: FSM 상태 전이 감사 로그

```sql
CREATE TABLE round_transitions (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  
  -- 전이 정보
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  
  -- 트리거
  triggered_by TEXT NOT NULL CHECK (
    triggered_by IN ('CRON_JOB', 'ADMIN', 'SYSTEM', 'API')
  ),
  
  -- 메타데이터
  metadata TEXT,                          -- JSON (이유, 가격 등)
  
  -- 타임스탬프
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
);

CREATE INDEX idx_round_transitions_round_id ON round_transitions(round_id);
CREATE INDEX idx_round_transitions_created_at ON round_transitions(created_at);
```

**감사 예시**
```sql
SELECT 
  from_status,
  to_status,
  triggered_by,
  datetime(created_at, 'unixepoch') as transition_time
FROM round_transitions
WHERE round_id = 'round123'
ORDER BY created_at;

-- 결과:
-- SCHEDULED → BETTING_OPEN  | CRON_JOB | 2025-11-15 14:00:00
-- BETTING_OPEN → BETTING_LOCKED | CRON_JOB | 2025-11-15 14:01:00
-- ...
```

---

## Sui Move Objects

### 1. Bet Object

**목적**: 개별 베팅의 온체인 표현

```rust
// Module: betting.move

struct Bet has key, store {
    id: UID,
    round_id: u64,                  // 라운드 번호
    user: address,                  // 베팅한 유저 주소
    prediction: u8,                 // 1 = GOLD, 2 = BTC
    amount: u64,                    // 베팅 금액 (del)
    timestamp: u64,                 // 베팅 시각
    locked: bool,                   // 자금 잠금 여부
}
```

**생명주기**
1. `place_bet()` 호출 → Bet Object 생성
2. DEL 코인 Contract에 Lock
3. 정산 시 `unlock_bet()` → 승자에게 배당 전송

---

### 2. BettingPool Object

**목적**: 라운드별 베팅 풀 관리

```rust
struct BettingPool has key {
    id: UID,
    round_id: u64,
    round_type: vector<u8>,         // "6HOUR", "1DAY" 등
    
    // 풀 정보
    total_pool: u64,
    gold_pool: u64,
    btc_pool: u64,
    
    // 상태
    status: u8,                     // 1=OPEN, 2=LOCKED, 3=SETTLED
    
    // 시간
    start_time: u64,
    end_time: u64,
    lock_time: u64,
    
    // 베팅 목록
    bet_ids: VecMap<address, ID>,   // user → bet_object_id 매핑
}
```

**주요 함수**
- `create_pool()`: 라운드 시작 시 생성
- `add_bet()`: 베팅 추가 시 풀 업데이트
- `finalize_pool()`: 베팅 마감

---

### 3. Settlement Object

**목적**: 정산 결과의 영구 기록

```rust
struct Settlement has key {
    id: UID,
    round_id: u64,
    
    // 가격 데이터
    gold_start: u64,                // 정수로 저장 (예: 265050 = $2650.50)
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,
    
    // 승자 정보
    winner: u8,                     // 1=GOLD, 2=BTC, 3=DRAW
    
    // 풀 정보
    total_pool: u64,
    winning_pool: u64,
    losing_pool: u64,
    platform_fee: u64,
    
    // 배당 정보
    payout_ratio: u64,              // 고정소수점 (예: 185 = 1.85배)
    total_winners: u64,
    
    // 타임스탬프
    settled_at: u64,
}
```

**불변성**
- 한번 생성되면 수정 불가
- 블록체인에 영구 보존
- 분쟁 시 최종 증거

---

### 4. DEL Coin

**목적**: 플랫폼 메인 재화

```rust
struct DEL has drop {}              // One-Time Witness

struct TreasuryCap<DEL> has key {
    id: UID,
    total_supply: u64
}
```

**관리**
- Admin만 `mint()` 가능
- 출석 보상, 정산 시 발행
- 소각(`burn()`)도 가능

---

## 데이터 동기화 전략

### 동기화 원칙

**1. Sui가 Source of Truth**
```
베팅 플로우:
1. Sui 트랜잭션 전송 (place_bet)
2. 성공 → D1에 기록
3. 실패 → 에러 반환

정산 플로우:
1. Sui Settlement Object 생성
2. 성공 → D1 업데이트
3. 불일치 검증 (정기)
```

**2. D1은 빠른 조회용 캐시**
- UI 렌더링: D1 조회 (빠름)
- 감사/검증: Sui 조회 (느리지만 정확)

### 동기화 시점

| 이벤트            | Sui 작업                    | D1 작업                      |
| ----------------- | --------------------------- | ---------------------------- |
| 베팅 생성         | Bet Object 생성             | bets 테이블 INSERT           |
| 라운드 시작       | BettingPool 생성            | rounds.status 업데이트       |
| 정산 완료         | Settlement Object 생성      | settlements 테이블 INSERT    |
| 배당 전송         | Transfer Payout (각 승자)   | bets.payout_amount 업데이트  |

### 불일치 검증 (일 1회)

**Cron Job: 03:00 KST**
```
1. 어제 정산된 라운드 조회 (D1)
2. Sui에서 Settlement Object 조회
3. 비교:
   - winner 일치?
   - total_pool 일치?
   - payout 일치?
4. 불일치 시 → Slack 알림 + 수동 확인
```

---

## 인덱스 및 최적화

### 주요 쿼리 패턴

**1. 현재 활성 라운드 조회**
```sql
SELECT * FROM rounds 
WHERE type = '6HOUR' 
  AND status IN ('BETTING_OPEN', 'BETTING_LOCKED')
ORDER BY start_time DESC 
LIMIT 1;

-- 인덱스: idx_rounds_type_status
```

**2. 유저별 베팅 이력**
```sql
SELECT * FROM bets 
WHERE user_id = ? 
ORDER BY created_at DESC 
LIMIT 20;

-- 인덱스: idx_bets_user_id, idx_bets_created_at
```

**3. 라운드별 승자 조회 (정산용)**
```sql
SELECT * FROM bets 
WHERE round_id = ? 
  AND prediction = ? 
  AND settlement_status = 'PENDING';

-- 인덱스: idx_bets_round_id, idx_bets_settlement_status
```

### SQLite 설정 (Cloudflare D1 기본 제공)

```sql
-- WAL 모드 (Write-Ahead Logging)
PRAGMA journal_mode = WAL;

-- 동기화 레벨
PRAGMA synchronous = NORMAL;

-- 캐시 크기
PRAGMA cache_size = 10000;

-- 임시 저장소
PRAGMA temp_store = MEMORY;
```

---

## 마이그레이션 전략

### Drizzle Kit 워크플로우

**1. 스키마 변경**
```typescript
// db/schema/rounds.ts
export const rounds = sqliteTable('rounds', {
  id: text('id').primaryKey(),
  // 새 컬럼 추가
  newField: text('new_field'),
  // ...
});
```

**2. 마이그레이션 생성**
```bash
npm run db:generate
# → drizzle/0001_add_new_field.sql 생성
```

**3. 로컬 적용**
```bash
npm run db:migrate:local
```

**4. D1 적용 (프로덕션)**
```bash
npm run db:migrate
# → Cloudflare D1에 자동 적용
```

### 마이그레이션 파일 예시

```sql
-- drizzle/0001_init.sql
CREATE TABLE users (...);
CREATE TABLE rounds (...);
-- ...

-- drizzle/0002_add_attendance.sql
ALTER TABLE users ADD COLUMN last_attendance_at INTEGER;
ALTER TABLE users ADD COLUMN attendance_streak INTEGER DEFAULT 0;
```

### 롤백 전략

**방법 1: 수동 롤백 SQL 작성**
```sql
-- rollback/0002_rollback.sql
ALTER TABLE users DROP COLUMN last_attendance_at;
ALTER TABLE users DROP COLUMN attendance_streak;
```

**방법 2: 백업 및 복원**
```bash
# D1 백업
wrangler d1 export deltax-db --output backup.sql

# 복원
wrangler d1 import deltax-db --file backup.sql
```

---

## 요약

### 테이블 개수
- **8개 D1 테이블**
- **4개 Sui Objects**

### 주요 관계
```
users (1) ──< (N) bets
rounds (1) ──< (N) bets
rounds (1) ──< (1) settlements
users (1) ──< (N) achievements
users (1) ──< (N) point_transactions
rounds (1) ──< (N) round_transitions
rounds (1) ──< (N) price_snapshots
```

### 데이터 크기 예상

**하루 1000 베팅 기준**
- rounds: ~10 rows/day (4 × 6HOUR + 1 × 1DAY + ...)
- bets: ~1000 rows/day
- point_transactions: ~2000 rows/day (베팅 + 정산)
- **월간**: ~90,000 rows

**SQLite 한계**: 수억 rows까지 가능 (문제없음)

---
