# SUI_CONTRACT_SPEC.md

deltaX Sui 블록체인 통합 기술 명세서

---

## 📋 목차

1. [개요 및 결정사항](#1-개요-및-결정사항)
2. [아키텍처](#2-아키텍처)
3. [Move 컨트랙트 명세](#3-move-컨트랙트-명세)
4. [Next.js 통합 명세](#4-nextjs-통합-명세)
5. [API 변경사항](#5-api-변경사항)
6. [시퀀스 다이어그램](#6-시퀀스-다이어그램)
7. [에러 처리 및 복구](#7-에러-처리-및-복구)
8. [보안 정책](#8-보안-정책)
9. [테스트 전략](#9-테스트-전략)
10. [배포 체크리스트](#10-배포-체크리스트)

---

## 1. 개요 및 결정사항

### 1.1 목표

- 베팅 자금의 온체인 Lock/Unlock으로 투명성 확보
- 정산 기록의 불변 저장으로 분쟁 해결 근거 마련
- 유저 UX 최적화 (가스비 대납)

### 1.2 핵심 결정사항

| #   | 항목          | 결정                              | 근거                     |
| --- | ------------- | --------------------------------- | ------------------------ |
| 1   | DEL 발행 정책 | **무제한 발행**                   | 프로토타입 단계, 단순성  |
| 2   | 트랜잭션 방식 | **백엔드 Sponsored**              | UX 우선, 유저 SUI 불필요 |
| 3   | Pool 구조     | **라운드당 1개 Pool**             | 격리, 정산 단순화        |
| 4   | 가격 데이터   | **Settlement에 온체인 기록**      | 투명성, 검증 가능성      |
| 5   | 수수료 수취   | **Coin 반환 (호출자가 transfer)** | Composability, PTB 호환  |
| 6   | 유저 인증     | **지갑 서명 검증**                | 보안                     |
| 7   | Object 설계   | **Pool=Shared, Bet=Owned**        | 병렬성 + 소유권          |

### 1.3 Sponsored Transaction + Event 정책

**문제**: Admin 서명 시 트랜잭션 sender가 Admin이 되어 실제 유저 식별 불가

**해결**: 모든 유저 관련 함수에서 Event 발생, Event에 실제 유저 주소 포함

```
place_bet() → emit BetPlaced { user: address, ... }
distribute_payout() → emit PayoutDistributed { user: address, ... }
```

---

## 2. 아키텍처

### 2.1 하이브리드 구조

```
┌─────────────────────────────────────────────────────────────┐
│                      Sui Blockchain                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  del_coin    │  │   betting    │  │  settlement  │       │
│  │              │  │              │  │              │       │
│  │  - DEL 발행  │  │  - Pool 관리 │  │  - 정산 기록 │       │
│  │  - 소각     │  │  - 베팅 생성 │  │  - 배당 전송 │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              ↑↓
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Backend                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ lib/sui/     │  │ lib/bets/    │  │ lib/rounds/  │       │
│  │              │  │              │  │              │       │
│  │  - client    │  │  - service   │  │  - service   │       │
│  │  - betting   │  │  - repo      │  │  - repo      │       │
│  │  - settle    │  │              │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              ↑↓
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare D1                           │
│  rounds, bets, users, settlements...                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 역할 분담

| 계층    | 역할                          | 데이터                                     |
| ------- | ----------------------------- | ------------------------------------------ |
| **Sui** | 자금 Lock/Transfer, 불변 기록 | Bet Object, Settlement Object, DEL Balance |
| **D1**  | 빠른 조회, 스케줄링, 통계     | rounds, bets (+ sui_tx_hash 등)            |

### 2.3 데이터 흐름 원칙

```
쓰기: Sui-First
1. D1 읽기 전용 검증
2. Sui 트랜잭션 실행
3. Sui 성공 후 D1 저장

읽기: D1-First
1. D1에서 조회 (빠름)
2. 필요 시 Sui 검증 (분쟁 시)
```

---

## 3. Move 컨트랙트 명세

### 3.1 패키지 구조

```
contracts/
├── Move.toml
├── sources/
│   ├── del.move           # DEL 토큰
│   └── betting.move       # 베팅 + 정산 로직 (통합)
└── tests/
    ├── del_tests.move
    └── betting_tests.move
```

> **Note**: 기존 settlement.move는 betting.move에 통합됨.
> 이유: 1) 의존성 단순화 2) BettingPool/Bet 객체를 한 모듈에서 관리 3) 프로토타입 단계에서 파일 분리 오버헤드 감소

### 3.2 del.move

#### Struct

```move
module deltax::del_coin {
    /// One-Time Witness (패키지당 1회만 생성)
    struct DEL has drop {}
}
```

#### 상수

```move
const DECIMALS: u8 = 9;  // 1 DEL = 10^9 units
```

#### 함수 시그니처

```move
/// 초기화 (배포 시 자동 호출)
fun init(witness: DEL, ctx: &mut TxContext)

/// DEL 발행 (Admin 전용)
public fun mint(
    treasury: &mut TreasuryCap<DEL>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
)

/// DEL 소각 (선택적)
public fun burn(
    treasury: &mut TreasuryCap<DEL>,
    coin: Coin<DEL>
)
```

#### 저장 구조

```
TreasuryCap<DEL> → Admin 소유 (발행 권한)
CoinMetadata<DEL> → Frozen (불변, 공개)
```

---

### 3.3 betting.move

#### Struct

```move
module deltax::betting {
    /// Admin 권한 증명
    struct AdminCap has key, store {
        id: UID
    }

    /// 라운드별 베팅 풀 (Shared Object)
    struct BettingPool has key {
        id: UID,
        round_id: u64,

        // 잔액
        gold_balance: Balance<DEL>,
        btc_balance: Balance<DEL>,

        // 통계 (D1과 동기화용)
        total_pool: u64,
        gold_pool: u64,
        btc_pool: u64,
        bet_count: u64,

        // 상태
        status: u8,           // 1=OPEN, 2=LOCKED, 3=SETTLED

        // 시간 (Unix timestamp seconds)
        lock_time: u64,
        end_time: u64,
    }

    /// 개별 베팅 (Owned Object → 유저 소유)
    struct Bet has key, store {
        id: UID,
        pool_id: ID,          // 소속 Pool
        user: address,        // 실제 베팅 유저
        prediction: u8,       // 1=GOLD, 2=BTC
        amount: u64,
        timestamp: u64,
    }
}
```

#### 상수

```move
// 상태
const STATUS_OPEN: u8 = 1;
const STATUS_LOCKED: u8 = 2;
const STATUS_SETTLED: u8 = 3;

// 예측
const PREDICTION_GOLD: u8 = 1;
const PREDICTION_BTC: u8 = 2;

// 제한
const MIN_BET_AMOUNT: u64 = 100_000_000_000;  // 100 DEL (decimals=9)

// 에러 코드
const E_BETTING_CLOSED: u64 = 1;
const E_INVALID_PREDICTION: u64 = 2;
const E_INSUFFICIENT_AMOUNT: u64 = 3;
const E_UNAUTHORIZED: u64 = 4;
const E_POOL_NOT_OPEN: u64 = 5;
const E_TOO_LATE: u64 = 6;
```

#### Events (중요!)

```move
/// 베팅 생성 이벤트
struct BetPlaced has copy, drop {
    bet_id: ID,
    pool_id: ID,
    user: address,        // ← 실제 유저 (Sponsored여도 기록됨)
    prediction: u8,
    amount: u64,
    timestamp: u64,
}

/// 풀 상태 변경 이벤트
struct PoolStatusChanged has copy, drop {
    pool_id: ID,
    round_id: u64,
    old_status: u8,
    new_status: u8,
    timestamp: u64,
}
```

#### 함수 시그니처

```move
/// Pool 생성 (Cron Job 2에서 호출)
public fun create_pool(
    _: &AdminCap,
    round_id: u64,
    lock_time: u64,
    end_time: u64,
    ctx: &mut TxContext
): ID

/// 베팅 (백엔드에서 Sponsored로 호출)
/// user 파라미터: 실제 베팅 유저 주소 (sender와 다를 수 있음)
public fun place_bet(
    pool: &mut BettingPool,
    user: address,            // ← 실제 유저 (Event에 기록)
    prediction: u8,
    payment: Coin<DEL>,
    clock: &Clock,
    ctx: &mut TxContext
): ID

/// Pool 잠금 (Cron Job 3에서 호출)
public fun lock_pool(
    _: &AdminCap,
    pool: &mut BettingPool,
    clock: &Clock
)

/// Pool 통계 조회 (View)
public fun get_pool_stats(pool: &BettingPool): (u64, u64, u64, u64)
```

#### 정산 관련 (기존 settlement.move에서 통합)

##### Settlement Struct

```move
/// 정산 기록 (Shared Object, 불변)
struct Settlement has key {
    id: UID,
    pool_id: ID,
    round_id: u64,

    // 가격 데이터 (정수, 소수점 2자리 → *100)
    gold_start: u64,      // 265050 = $2650.50
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,

    // 결과
    winner: u8,           // 1=GOLD, 2=BTC (동점 시 GOLD 승리, DRAW 미구현)

    // 풀 정보
    total_pool: u64,
    winning_pool: u64,
    platform_fee: u64,
    payout_ratio: u64,    // 178 = 1.78x (scale=100)

    // 메타
    settled_at: u64,
}
```

##### 정산 상수

```move
const WINNER_GOLD: u8 = 1;
const WINNER_BTC: u8 = 2;
// WINNER_DRAW: 미구현 (동점 시 GOLD 승리)

const PLATFORM_FEE_RATE: u64 = 5;  // 5%
const RATIO_SCALE: u64 = 100;

const E_NOT_LOCKED: u64 = 10;
const E_TOO_EARLY: u64 = 11;
const E_ALREADY_SETTLED: u64 = 12;
const E_NOT_WINNER: u64 = 13;
const E_ROUND_MISMATCH: u64 = 14;
```

##### 정산 Events

```move
/// 정산 완료 이벤트
struct SettlementCreated has copy, drop {
    settlement_id: ID,
    pool_id: ID,
    round_id: u64,
    winner: u8,
    payout_ratio: u64,
    settled_at: u64,
}

/// 배당 전송 이벤트
struct PayoutDistributed has copy, drop {
    settlement_id: ID,
    bet_id: ID,
    user: address,        // ← 실제 수령 유저
    amount: u64,
    timestamp: u64,
}

// RefundProcessed: 미구현 (DRAW 없음)
```

##### 정산 함수

```move
/// 라운드 정산 (Cron Job 4에서 호출)
/// 반환: (Settlement ID, Platform Fee Coin)
/// 호출자가 fee_coin을 Admin에게 transfer해야 함
public fun finalize_round(
    _: &AdminCap,
    pool: &mut BettingPool,
    gold_start: u64,
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,
    clock: &Clock,
    ctx: &mut TxContext
): (ID, Coin<DEL>)

/// 승자 배당 전송 (Cron Job 5에서 호출)
/// 패자도 이 함수로 처리 (0 DEL 반환, Bet 소각)
public fun distribute_payout(
    _: &AdminCap,
    pool: &mut BettingPool,
    settlement: &Settlement,
    bet: Bet,               // 소유권 이전 (소각됨)
    clock: &Clock,          // timestamp용
    ctx: &mut TxContext
): Coin<DEL>

// refund_bet: 미구현 (DRAW 없음, 동점 시 GOLD 승리)
```

---

## 4. Next.js 통합 명세

### 4.1 새 파일 구조

```
lib/sui/
├── client.ts           # SuiClient 초기화
├── config.ts           # Package ID, Admin Key (환경변수)
├── admin.ts            # AdminCap 관리
├── betting.ts          # place_bet, lock_pool 래퍼
├── settlement.ts       # finalize, distribute 래퍼
├── verify.ts           # 트랜잭션/이벤트 검증
└── types.ts            # Sui 관련 타입
```

### 4.2 lib/sui/config.ts

```typescript
export const SUI_CONFIG = {
  network: process.env.SUI_NETWORK || 'testnet',
  packageId: process.env.SUI_PACKAGE_ID!,
  adminCapId: process.env.SUI_ADMIN_CAP_ID!,
  treasuryCapId: process.env.SUI_TREASURY_CAP_ID!,
} as const;

// 환경변수 검증 (서버 시작 시)
export function validateSuiConfig(): void {
  const required = ['SUI_PACKAGE_ID', 'SUI_ADMIN_CAP_ID', 'SUI_ADMIN_SECRET_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Sui config: ${missing.join(', ')}`);
  }
}
```

### 4.3 lib/sui/client.ts

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SUI_CONFIG } from './config';

// Singleton SuiClient
let _client: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!_client) {
    _client = new SuiClient({
      url: getFullnodeUrl(SUI_CONFIG.network as 'testnet' | 'mainnet'),
    });
  }
  return _client;
}

// Admin Keypair (Sponsored Transaction용)
let _adminKeypair: Ed25519Keypair | null = null;

export function getAdminKeypair(): Ed25519Keypair {
  if (!_adminKeypair) {
    const secretKey = process.env.SUI_ADMIN_SECRET_KEY!;
    _adminKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(secretKey, 'base64'));
  }
  return _adminKeypair;
}
```

### 4.4 lib/sui/betting.ts

```typescript
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { getSuiClient, getAdminKeypair } from './client';
import { SUI_CONFIG } from './config';

export interface PlaceBetParams {
  poolId: string;
  userAddress: string;
  prediction: 'GOLD' | 'BTC';
  delCoinId: string; // 유저의 DEL Coin Object ID
}

export interface PlaceBetResult {
  txHash: string;
  betObjectId: string;
}

export async function placeBetOnSui(params: PlaceBetParams): Promise<PlaceBetResult> {
  const client = getSuiClient();
  const adminKeypair = getAdminKeypair();

  const tx = new TransactionBlock();

  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::betting::place_bet`,
    arguments: [
      tx.object(params.poolId),
      tx.pure(params.userAddress, 'address'),
      tx.pure(params.prediction === 'GOLD' ? 1 : 2, 'u8'),
      tx.object(params.delCoinId),
      tx.object('0x6'), // Clock
    ],
  });

  const result = await client.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: adminKeypair,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`Sui transaction failed: ${result.effects?.status?.error}`);
  }

  // Bet Object ID 추출
  const betCreated = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.includes('::Bet'),
  );

  return {
    txHash: result.digest,
    betObjectId: betCreated?.objectId || '',
  };
}

export async function createPoolOnSui(params: {
  roundId: number;
  lockTime: number;
  endTime: number;
}): Promise<{ txHash: string; poolId: string }> {
  // 구현...
}

export async function lockPoolOnSui(poolId: string): Promise<{ txHash: string }> {
  // 구현...
}
```

### 4.5 lib/sui/types.ts

```typescript
export type SuiPrediction = 1 | 2; // 1=GOLD, 2=BTC
export type SuiPoolStatus = 1 | 2 | 3; // OPEN, LOCKED, SETTLED
export type SuiWinner = 1 | 2 | 3; // GOLD, BTC, DRAW

export interface SuiBetEvent {
  bet_id: string;
  pool_id: string;
  user: string;
  prediction: SuiPrediction;
  amount: string;
  timestamp: string;
}

export interface SuiSettlementEvent {
  settlement_id: string;
  pool_id: string;
  round_id: string;
  winner: SuiWinner;
  payout_ratio: string;
  settled_at: string;
}
```

---

## 5. API 변경사항

### 5.1 POST /api/bets 수정

#### Before (Week 1)

```typescript
async createBet(rawInput, userId) {
  // 1. 검증
  // 2. D1 INSERT + Pool Update
  // 3. 응답
}
```

#### After (Week 2+)

```typescript
async createBet(rawInput, userId) {
  // 1. 검증 (기존 유지)
  const validated = createBetSchema.parse(rawInput);
  const round = await this.roundRepository.findById(validated.roundId);

  // 2. Sui Pool 주소 필요
  if (!round.suiPoolAddress) {
    throw new BusinessRuleError('POOL_NOT_READY', 'Sui pool not created');
  }

  // 🆕 3. Sui 트랜잭션 먼저
  const { txHash, betObjectId } = await placeBetOnSui({
    poolId: round.suiPoolAddress,
    userAddress: validated.userAddress,  // 유저 지갑 주소
    prediction: validated.prediction,
    delCoinId: validated.delCoinId,      // 유저의 DEL Coin
  });

  // 4. D1 저장 (기존 + Sui 필드)
  const { bet, round: updatedRound } = await this.betRepository.create({
    ...betInput,
    suiTxHash: txHash,
    suiBetObjectId: betObjectId,
  });

  return { bet, round: updatedRound, txHash };
}
```

#### Request Body 변경

```typescript
// Before
{
  roundId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
}

// After
{
  roundId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
  userAddress: string; // 🆕 유저 Sui 지갑 주소
  delCoinId: string; // 🆕 사용할 DEL Coin Object ID
}
```

### 5.2 Cron Job 변경

#### Job 2: Round Opener

```typescript
// 기존 + Sui Pool 생성
async openRound(prices: PriceData): Promise<OpenRoundResult> {
  const round = await this.findLatestScheduledRound();

  // 🆕 Sui Pool 생성
  const { txHash, poolId } = await createPoolOnSui({
    roundId: round.roundNumber,
    lockTime: Math.floor(round.lockTime / 1000),
    endTime: Math.floor(round.endTime / 1000),
  });

  // FSM 전이 + Sui 정보 저장
  const openedRound = await transitionRoundStatus(round.id, 'BETTING_OPEN', {
    suiPoolAddress: poolId,        // 🆕
    suiPoolCreateTxHash: txHash,   // 🆕 (선택)
    goldStartPrice: prices.gold.toString(),
    btcStartPrice: prices.btc.toString(),
    // ...
  });

  return { status: 'opened', round: openedRound };
}
```

#### Job 5: Settlement Processor

```typescript
async settleRound(roundId: string): Promise<SettleRoundResult> {
  const round = await this.repository.findById(roundId);

  // 🆕 Sui Settlement 생성
  const { txHash, settlementId } = await finalizeRoundOnSui({
    poolId: round.suiPoolAddress,
    goldStart: parsePrice(round.goldStartPrice),
    goldEnd: parsePrice(round.goldEndPrice),
    btcStart: parsePrice(round.btcStartPrice),
    btcEnd: parsePrice(round.btcEndPrice),
  });

  // 🆕 승자별 Sui 배당 전송
  for (const bet of winningBets) {
    const { payoutTxHash } = await distributePayoutOnSui({
      poolId: round.suiPoolAddress,
      settlementId,
      betObjectId: bet.suiBetObjectId,
    });

    // D1 업데이트
    await this.betService.updateBetSettlement(bet.id, {
      resultStatus: 'WON',
      settlementStatus: 'COMPLETED',
      payoutAmount: payout,
      suiPayoutTxHash: payoutTxHash,  // 🆕
    });
  }

  // D1 라운드 업데이트
  await transitionRoundStatus(roundId, 'SETTLED', {
    suiSettlementObjectId: settlementId,  // 🆕
    settlementCompletedAt: Date.now(),
  });
}
```

---

## 6. 시퀀스 다이어그램

### 6.1 베팅 플로우

```
┌──────┐     ┌──────────┐     ┌─────────┐     ┌─────┐     ┌────┐
│ User │     │ Frontend │     │ Next.js │     │ Sui │     │ D1 │
└──┬───┘     └────┬─────┘     └────┬────┘     └──┬──┘     └─┬──┘
   │              │                │              │          │
   │ 1. 지갑 연결 │                │              │          │
   │─────────────>│                │              │          │
   │              │                │              │          │
   │ 2. 베팅 요청 │                │              │          │
   │  (GOLD, 1000)│                │              │          │
   │─────────────>│                │              │          │
   │              │                │              │          │
   │              │ 3. POST /api/bets            │          │
   │              │   { prediction, amount,      │          │
   │              │     userAddress, delCoinId } │          │
   │              │───────────────>│              │          │
   │              │                │              │          │
   │              │                │ 4. 검증     │          │
   │              │                │────────────────────────>│
   │              │                │              │          │
   │              │                │ 5. place_bet()         │
   │              │                │   (Admin 서명)         │
   │              │                │─────────────>│          │
   │              │                │              │          │
   │              │                │              │ 6. DEL Lock
   │              │                │              │    Bet 생성
   │              │                │              │    Event 발생
   │              │                │<─────────────│          │
   │              │                │ tx_hash,    │          │
   │              │                │ bet_id      │          │
   │              │                │              │          │
   │              │                │ 7. D1 저장  │          │
   │              │                │────────────────────────>│
   │              │                │              │          │
   │              │ 8. 응답       │              │          │
   │              │<───────────────│              │          │
   │              │                │              │          │
   │ 9. 완료!    │                │              │          │
   │<─────────────│                │              │          │
```

### 6.2 정산 플로우

```
┌──────┐     ┌─────────┐     ┌─────┐     ┌────┐
│ Cron │     │ Next.js │     │ Sui │     │ D1 │
└──┬───┘     └────┬────┘     └──┬──┘     └─┬──┘
   │              │              │          │
   │ 1. Job 4    │              │          │
   │─────────────>│              │          │
   │              │              │          │
   │              │ 2. 라운드 조회          │
   │              │────────────────────────>│
   │              │              │          │
   │              │ 3. 가격 API │          │
   │              │   (현준)     │          │
   │              │              │          │
   │              │ 4. finalize_round()    │
   │              │─────────────>│          │
   │              │              │          │
   │              │              │ Settlement
   │              │<─────────────│ 생성
   │              │              │          │
   │ 5. Job 5    │              │          │
   │─────────────>│              │          │
   │              │              │          │
   │              │ 6. 승자 조회│          │
   │              │────────────────────────>│
   │              │              │          │
   │              │ 7. FOR EACH 승자:       │
   │              │    distribute_payout() │
   │              │─────────────>│          │
   │              │              │ DEL 전송 │
   │              │<─────────────│          │
   │              │              │          │
   │              │ 8. D1 업데이트          │
   │              │────────────────────────>│
```

---

## 7. 에러 처리 및 복구

### 7.1 에러 시나리오

| 시나리오     | 발생 시점         | 처리                         |
| ------------ | ----------------- | ---------------------------- |
| Sui Tx 실패  | place_bet 중      | 즉시 에러 반환, D1 기록 없음 |
| D1 저장 실패 | Sui 성공 후       | 복구 큐 추가, 나중에 동기화  |
| 부분 정산    | 배당 중 서버 다운 | Recovery Job이 재시도        |

### 7.2 복구 큐 테이블

```sql
-- 새 테이블 (선택적)
CREATE TABLE sui_recovery_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'BET_SYNC', 'PAYOUT_RETRY'
  payload TEXT NOT NULL,        -- JSON
  status TEXT DEFAULT 'PENDING',
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);
```

### 7.3 Recovery Job 로직

```typescript
// 1분마다 실행
async function processRecoveryQueue() {
  const pending = await db.select().from(suiRecoveryQueue).where(eq(status, 'PENDING')).limit(10);

  for (const item of pending) {
    if (item.type === 'BET_SYNC') {
      // Sui Event 조회 → D1 저장
    } else if (item.type === 'PAYOUT_RETRY') {
      // distribute_payout 재시도
    }
  }
}
```

---

## 8. 보안 정책

### 8.1 Admin Key 관리

```
저장 위치:
- 로컬: .env.local (gitignore)
- 프로덕션: Cloudflare Workers Secrets

생성:
$ sui keytool generate ed25519
$ wrangler secret put SUI_ADMIN_SECRET_KEY

절대 금지:
- Git 커밋
- 로그 출력
- 프론트엔드 노출
```

### 8.2 트랜잭션 검증

```typescript
// 프론트에서 받은 값은 무조건 검증
async function verifyBetTransaction(
  txHash: string,
  expected: {
    userAddress: string;
    amount: number;
    prediction: 'GOLD' | 'BTC';
  },
) {
  const tx = await getSuiClient().getTransactionBlock({
    digest: txHash,
    options: { showEvents: true },
  });

  // BetPlaced 이벤트 확인
  const event = tx.events?.find((e) => e.type.includes('::BetPlaced'));

  if (!event) throw new Error('No BetPlaced event');

  const data = event.parsedJson as SuiBetEvent;

  if (data.user !== expected.userAddress) {
    throw new Error('User mismatch');
  }
  if (BigInt(data.amount) !== BigInt(expected.amount)) {
    throw new Error('Amount mismatch');
  }
}
```

### 8.3 Rate Limiting

```typescript
// Sponsored Tx 남용 방지
const rateLimiter = new Map<string, number[]>();

export function checkBetRateLimit(userAddress: string): boolean {
  const now = Date.now();
  const window = 60 * 1000; // 1분
  const max = 10; // 최대 10 베팅/분

  const timestamps = rateLimiter.get(userAddress) || [];
  const recent = timestamps.filter((t) => now - t < window);

  if (recent.length >= max) return false;

  recent.push(now);
  rateLimiter.set(userAddress, recent);
  return true;
}
```

---

## 9. 테스트 전략

### 9.1 Move 단위 테스트

```move
// tests/betting_tests.move
#[test]
fun test_place_bet_success() {
    // 1. Pool 생성
    // 2. DEL 발행
    // 3. place_bet 호출
    // 4. 잔액/통계 검증
}

#[test]
#[expected_failure(abort_code = E_BETTING_CLOSED)]
fun test_place_bet_after_lock() {
    // Pool 잠금 후 베팅 시도 → 실패 검증
}

#[test]
fun test_settlement_gold_wins() {
    // 금 변동률 > BTC → GOLD 승리 검증
}
```

### 9.2 테스트 실행

```bash
cd contracts
sui move build
sui move test
sui move test --coverage  # 커버리지
```

### 9.3 통합 테스트 (추후)

```typescript
// __tests__/integration/sui-betting.test.ts
describe('Sui Betting Integration', () => {
  // Testnet에서 실제 테스트 (CI 제외)
});
```

---

## 10. 배포 체크리스트

### 10.1 Testnet 배포

```bash
# 1. 빌드
cd contracts
sui move build

# 2. 배포
sui client publish --gas-budget 200000000

# 3. 출력에서 확인
# - Package ID
# - AdminCap Object ID
# - TreasuryCap Object ID

# 4. 환경변수 설정
echo "SUI_PACKAGE_ID=0x..." >> .env.local
echo "SUI_ADMIN_CAP_ID=0x..." >> .env.local
echo "SUI_TREASURY_CAP_ID=0x..." >> .env.local
```

### 10.2 검증 항목

- [ ] `sui move test` 전체 통과
- [ ] Testnet 배포 성공
- [ ] AdminCap 소유권 확인
- [ ] TreasuryCap 소유권 확인
- [ ] DEL Mint 테스트
- [ ] create_pool 테스트
- [ ] place_bet 테스트
- [ ] lock_pool 테스트
- [ ] finalize_round 테스트
- [ ] distribute_payout 테스트

### 10.3 환경변수 목록

```bash
# .env.local
SUI_NETWORK=testnet
SUI_PACKAGE_ID=0x...
SUI_ADMIN_CAP_ID=0x...
SUI_TREASURY_CAP_ID=0x...
SUI_ADMIN_SECRET_KEY=base64...
```

---

## 부록: Move.toml 설정

```toml
[package]
name = "deltax"
version = "0.0.1"
edition = "2024.beta"

[addresses]
deltax = "0x0"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "testnet" }
```

---

## 변경 이력

| 버전  | 날짜       | 변경 내용                                                                                                                            |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0 | 2024-12-01 | 초안 작성                                                                                                                            |
| 0.2.0 | 2024-12-04 | 구현 반영: finalize_round 반환타입 변경 `(ID, Coin<DEL>)`, DRAW 미구현(동점시 GOLD), refund_bet 제거, distribute_payout에 clock 추가 |

---

## 부록: 의사결정 기록

### D1. Fee 처리 방식 (2024-12-04)

**문제**: `finalize_round`에서 fee를 Admin에게 직접 transfer 시 warning 발생

```
warning[Lint W99001]: non-composable transfer to sender
```

**결정**: `(ID, Coin<DEL>)` 튜플 반환으로 변경

- 호출자(Next.js)가 PTB에서 fee_coin을 Admin에게 transfer
- Composability 유지, Sui 철학 준수

### D2. DRAW 처리 (2024-12-04)

**문제**: 스펙에 DRAW(동점) 케이스 있으나, 비즈니스 로직상 필요성 낮음

**결정**: 미구현, 동점 시 GOLD 승리

- `WINNER_DRAW`, `refund_bet`, `RefundProcessed` 제거
- 프로토타입 단계 단순화
- 추후 필요시 추가

### D3. distribute_payout 패자 처리 (2024-12-04)

**결정**: 패자도 동일 함수로 처리

- 패자: 0 DEL Coin 반환, Bet 소각
- 승자/패자 분기 없이 일관된 인터페이스
