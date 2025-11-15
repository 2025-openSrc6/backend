# SUI_INTEGRATION.md

deltaX 베팅 시스템의 Sui 블록체인 통합 전략 및 Move 컨트랙트 설계

---

## 📋 목차

1. [개요](#개요)
2. [Sui Move 모듈 구조](#sui-move-모듈-구조)
3. [베팅 플로우](#베팅-플로우)
4. [정산 플로우](#정산-플로우)
5. [가스비 관리 (Sponsored Transactions)](#가스비-관리-sponsored-transactions)
6. [Next.js 통합](#nextjs-통합)
7. [에러 처리 및 복구](#에러-처리-및-복구)
8. [테스트 전략](#테스트-전략)
9. [보안 고려사항](#보안-고려사항)

---

## 개요

### 하이브리드 아키텍처

**역할 분담**
```
┌─────────────────────────────────────┐
│         Sui Blockchain              │
│  ────────────────────────────────   │
│  ✅ 베팅 자금 Lock/Unlock            │
│  ✅ 정산 기록 (불변)                 │
│  ✅ 배당 자동 전송                   │
│  ✅ NFT 소유권 관리                  │
│  ✅ 감사 추적 (Audit Trail)          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│      Next.js Backend (D1)           │
│  ────────────────────────────────   │
│  ✅ 라운드 스케줄링                  │
│  ✅ 가격 데이터 수집                 │
│  ✅ 빠른 조회 (캐시)                 │
│  ✅ 실시간 집계/통계                 │
│  ✅ UI 렌더링 데이터                 │
└─────────────────────────────────────┘
```

### Sui 선택 이유

| 특징          | Sui               | Ethereum          | Solana            |
| ------------- | ----------------- | ----------------- | ----------------- |
| **TPS**       | 120,000+          | 15-20             | 50,000+           |
| **최종성**    | 0.5초             | 12-15초           | 0.4초             |
| **가스비**    | ~$0.001           | $5-50             | $0.00025          |
| **병렬 처리** | ✅ Object-based   | ❌                | ✅                |
| **안전성**    | Move 언어         | Solidity          | Rust              |
| **안정성**    | ✅                | ✅                | ⚠️ (간헐적 중단)  |

**결론**: 빠르고 저렴하며 안정적 → **Sui 채택**

---

## Sui Move 모듈 구조

### 패키지 구성

```
deltax/
├── sources/
│   ├── del_coin.move          # DEL 재화 관리
│   ├── betting.move           # 베팅 로직
│   ├── settlement.move        # 정산 로직
│   └── nft.move               # NFT 관리 (김영민)
├── tests/
│   ├── betting_tests.move
│   └── settlement_tests.move
└── Move.toml
```

---

### 1. del_coin.move

**목적**: DEL 재화 (Coin) 관리

#### Struct 정의

```rust
module deltax::del_coin {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::url;
    
    /// One-Time Witness (OTW)
    struct DEL has drop {}
    
    /// Witness 패턴으로 한 번만 초기화
    fun init(witness: DEL, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9,                          // decimals (10^9 = 1 DEL)
            b"DEL",                     // symbol
            b"Delta Legends",           // name
            b"DeltaX platform token",   // description
            option::some(url::new_unsafe_from_bytes(b"https://deltax.app/logo.png")),
            ctx
        );
        
        // TreasuryCap을 Admin에게 전송
        transfer::public_transfer(treasury, tx_context::sender(ctx));
        
        // CoinMetadata를 공유 객체로 등록
        transfer::public_freeze_object(metadata);
    }
}
```

#### 주요 함수

**mint (Admin 전용)**
```rust
public fun mint(
    treasury: &mut TreasuryCap<DEL>,
    amount: u64,
    ctx: &mut TxContext
): Coin<DEL> {
    coin::mint(treasury, amount, ctx)
}
```

**burn (소각)**
```rust
public fun burn(
    treasury: &mut TreasuryCap<DEL>,
    coin: Coin<DEL>
) {
    coin::burn(treasury, coin);
}
```

**사용 시나리오**
1. **출석 보상**: Admin이 5,000 DEL mint → 유저에게 전송
2. **정산**: Settlement에서 승자에게 배당 mint
3. **소각**: 필요 시 (예: 디플레이션 정책)

---

### 2. betting.move

**목적**: 베팅 생성 및 자금 Lock

#### Struct 정의

```rust
module deltax::betting {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use deltax::del_coin::DEL;
    
    /// 개별 베팅
    struct Bet has key, store {
        id: UID,
        round_id: u64,
        user: address,
        prediction: u8,         // 1 = GOLD, 2 = BTC
        amount: u64,
        timestamp: u64,
        locked: bool,
    }
    
    /// 라운드별 베팅 풀
    struct BettingPool has key {
        id: UID,
        round_id: u64,
        round_type: vector<u8>,     // "6HOUR", "1DAY"
        
        // 풀 잔액
        total_balance: Balance<DEL>,
        gold_balance: Balance<DEL>,
        btc_balance: Balance<DEL>,
        
        // 통계
        total_pool: u64,
        gold_pool: u64,
        btc_pool: u64,
        total_bets: u64,
        
        // 상태
        status: u8,                 // 1=OPEN, 2=LOCKED, 3=SETTLED
        
        // 시간
        start_time: u64,
        end_time: u64,
        lock_time: u64,
        
        // Admin
        admin: address,
    }
    
    /// 베팅 생성 이벤트
    struct BetPlaced has copy, drop {
        bet_id: ID,
        round_id: u64,
        user: address,
        prediction: u8,
        amount: u64,
        timestamp: u64,
    }
}
```

#### 주요 함수

**1. create_pool (Admin)**
```rust
public fun create_pool(
    round_id: u64,
    round_type: vector<u8>,
    start_time: u64,
    end_time: u64,
    lock_time: u64,
    admin: address,
    ctx: &mut TxContext
): ID {
    let pool = BettingPool {
        id: object::new(ctx),
        round_id,
        round_type,
        total_balance: balance::zero(),
        gold_balance: balance::zero(),
        btc_balance: balance::zero(),
        total_pool: 0,
        gold_pool: 0,
        btc_pool: 0,
        total_bets: 0,
        status: 1,              // OPEN
        start_time,
        end_time,
        lock_time,
        admin,
    };
    
    let pool_id = object::uid_to_inner(&pool.id);
    
    // 공유 객체로 등록 (누구나 접근 가능)
    transfer::share_object(pool);
    
    pool_id
}
```

**2. place_bet (유저)**
```rust
public fun place_bet(
    pool: &mut BettingPool,
    prediction: u8,             // 1 = GOLD, 2 = BTC
    payment: Coin<DEL>,
    clock: &Clock,
    ctx: &mut TxContext
): ID {
    // 1. 검증
    assert!(pool.status == 1, E_BETTING_CLOSED);
    assert!(prediction == 1 || prediction == 2, E_INVALID_PREDICTION);
    
    let now = clock::timestamp_ms(clock) / 1000;
    assert!(now < pool.lock_time, E_BETTING_LOCKED);
    
    let amount = coin::value(&payment);
    assert!(amount >= MIN_BET_AMOUNT, E_INSUFFICIENT_AMOUNT);
    
    // 2. 베팅 생성
    let bet = Bet {
        id: object::new(ctx),
        round_id: pool.round_id,
        user: tx_context::sender(ctx),
        prediction,
        amount,
        timestamp: now,
        locked: true,
    };
    
    let bet_id = object::uid_to_inner(&bet.id);
    
    // 3. 자금 Lock (풀에 추가)
    let payment_balance = coin::into_balance(payment);
    balance::join(&mut pool.total_balance, payment_balance);
    
    // 4. 풀 업데이트
    pool.total_pool = pool.total_pool + amount;
    pool.total_bets = pool.total_bets + 1;
    
    if (prediction == 1) {
        let gold_portion = balance::split(&mut pool.total_balance, amount);
        balance::join(&mut pool.gold_balance, gold_portion);
        pool.gold_pool = pool.gold_pool + amount;
    } else {
        let btc_portion = balance::split(&mut pool.total_balance, amount);
        balance::join(&mut pool.btc_balance, btc_portion);
        pool.btc_pool = pool.btc_pool + amount;
    };
    
    // 5. 이벤트 발생
    event::emit(BetPlaced {
        bet_id,
        round_id: pool.round_id,
        user: tx_context::sender(ctx),
        prediction,
        amount,
        timestamp: now,
    });
    
    // 6. Bet 객체를 유저에게 전송 (소유권)
    transfer::public_transfer(bet, tx_context::sender(ctx));
    
    bet_id
}
```

**3. lock_pool (Admin - Cron)**
```rust
public fun lock_pool(
    pool: &mut BettingPool,
    admin_cap: &AdminCap,
    clock: &Clock
) {
    assert!(pool.admin == admin_cap.admin, E_UNAUTHORIZED);
    
    let now = clock::timestamp_ms(clock) / 1000;
    assert!(now >= pool.lock_time, E_TOO_EARLY);
    
    pool.status = 2;        // LOCKED
}
```

---

### 3. settlement.move

**목적**: 정산 로직 및 배당 전송

#### Struct 정의

```rust
module deltax::settlement {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use deltax::del_coin::DEL;
    use deltax::betting::{BettingPool, Bet};
    
    /// 정산 기록 (불변)
    struct Settlement has key {
        id: UID,
        round_id: u64,
        
        // 가격 데이터 (정수로 저장, 예: 265050 = $2650.50)
        gold_start: u64,
        gold_end: u64,
        btc_start: u64,
        btc_end: u64,
        
        // 승자
        winner: u8,             // 1=GOLD, 2=BTC, 3=DRAW
        
        // 풀 정보
        total_pool: u64,
        winning_pool: u64,
        losing_pool: u64,
        platform_fee: u64,
        
        // 배당
        payout_ratio: u64,      // 고정소수점 (예: 178 = 1.78배, scale=100)
        total_winners: u64,
        
        // 타임스탬프
        settled_at: u64,
    }
    
    /// 정산 완료 이벤트
    struct SettlementCompleted has copy, drop {
        settlement_id: ID,
        round_id: u64,
        winner: u8,
        payout_ratio: u64,
        total_winners: u64,
        settled_at: u64,
    }
}
```

#### 주요 함수

**1. finalize_round (Admin)**
```rust
public fun finalize_round(
    pool: &mut BettingPool,
    gold_start: u64,
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,
    platform_fee_rate: u64,     // 예: 5 (5%)
    admin_cap: &AdminCap,
    clock: &Clock,
    ctx: &mut TxContext
): ID {
    assert!(pool.admin == admin_cap.admin, E_UNAUTHORIZED);
    assert!(pool.status == 2, E_NOT_LOCKED);
    
    let now = clock::timestamp_ms(clock) / 1000;
    assert!(now >= pool.end_time, E_TOO_EARLY);
    
    // 1. 승자 판정
    let gold_change = calculate_change(gold_start, gold_end);
    let btc_change = calculate_change(btc_start, btc_end);
    
    let winner = if (gold_change > btc_change) {
        1   // GOLD
    } else if (btc_change > gold_change) {
        2   // BTC
    } else {
        3   // DRAW
    };
    
    // 2. 풀 정보
    let total_pool = pool.total_pool;
    let winning_pool = if (winner == 1) pool.gold_pool else pool.btc_pool;
    let losing_pool = if (winner == 1) pool.btc_pool else pool.gold_pool;
    
    // 3. 수수료 계산
    let platform_fee = (total_pool * platform_fee_rate) / 100;
    
    // 4. 배당 비율 (고정소수점, scale=100)
    let payout_pool = total_pool - platform_fee;
    let payout_ratio = if (winner == 3) {
        100     // DRAW = 1.00배 (환불)
    } else if (winning_pool > 0) {
        (payout_pool * 100) / winning_pool
    } else {
        0
    };
    
    // 5. Settlement 객체 생성
    let settlement = Settlement {
        id: object::new(ctx),
        round_id: pool.round_id,
        gold_start,
        gold_end,
        btc_start,
        btc_end,
        winner,
        total_pool,
        winning_pool,
        losing_pool,
        platform_fee,
        payout_ratio,
        total_winners: 0,       // 배당 시 업데이트
        settled_at: now,
    };
    
    let settlement_id = object::uid_to_inner(&settlement.id);
    
    // 6. 풀 상태 변경
    pool.status = 3;            // SETTLED
    
    // 7. 이벤트 발생
    event::emit(SettlementCompleted {
        settlement_id,
        round_id: pool.round_id,
        winner,
        payout_ratio,
        total_winners: 0,
        settled_at: now,
    });
    
    // 8. Settlement을 불변 객체로 공유
    transfer::share_object(settlement);
    
    settlement_id
}
```

**2. distribute_payout (Admin - 개별 승자)**
```rust
public fun distribute_payout(
    pool: &mut BettingPool,
    settlement: &mut Settlement,
    bet: Bet,               // 소유권 이전 (transfer)
    admin_cap: &AdminCap,
    ctx: &mut TxContext
): Coin<DEL> {
    assert!(pool.admin == admin_cap.admin, E_UNAUTHORIZED);
    assert!(pool.status == 3, E_NOT_SETTLED);
    assert!(bet.round_id == settlement.round_id, E_ROUND_MISMATCH);
    
    // 1. 승자 검증
    assert!(bet.prediction == settlement.winner || settlement.winner == 3, E_NOT_WINNER);
    assert!(bet.locked, E_ALREADY_PAID);
    
    // 2. 배당 계산
    let payout_amount = (bet.amount * settlement.payout_ratio) / 100;
    
    // 3. 풀에서 배당금 추출
    let payout_balance = if (bet.prediction == 1) {
        balance::split(&mut pool.gold_balance, payout_amount)
    } else {
        balance::split(&mut pool.btc_balance, payout_amount)
    };
    
    let payout_coin = coin::from_balance(payout_balance, ctx);
    
    // 4. Bet 잠금 해제
    bet.locked = false;
    
    // 5. Settlement 통계 업데이트
    settlement.total_winners = settlement.total_winners + 1;
    
    // 6. Bet 객체 소각 (더 이상 불필요)
    let Bet { id, .. } = bet;
    object::delete(id);
    
    // 7. 배당금을 유저에게 전송 (호출자가 처리)
    payout_coin
}
```

**Helper: 변동률 계산**
```rust
fun calculate_change(start: u64, end: u64): u64 {
    if (end > start) {
        ((end - start) * 10000) / start     // 예: 0.18% = 18
    } else if (start > end) {
        ((start - end) * 10000) / start     // 음수는 0 처리
    } else {
        0
    }
}
```

---

## 베팅 플로우

### 전체 시퀀스

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌─────────┐
│ 유저    │     │ Frontend │     │ Next.js │     │   Sui   │
└────┬────┘     └────┬─────┘     └────┬────┘     └────┬────┘
     │               │                 │                │
     │ 1. 베팅 버튼  │                 │                │
     │──────────────>│                 │                │
     │               │                 │                │
     │               │ 2. 지갑 서명 요청│                │
     │               │────────────────>│                │
     │               │                 │                │
     │               │                 │ 3. place_bet() │
     │               │                 │───────────────>│
     │               │                 │                │
     │               │                 │ 4. Bet Object  │
     │               │                 │<───────────────│
     │               │                 │   + tx_hash    │
     │               │                 │                │
     │               │ 5. POST /api/bets               │
     │               │    (tx_hash,    │                │
     │               │     bet_id)     │                │
     │               │<────────────────│                │
     │               │                 │                │
     │               │ 6. D1에 기록    │                │
     │               │    (bets 테이블) │               │
     │               │                 │                │
     │ 7. 베팅 완료  │                 │                │
     │<──────────────│                 │                │
     └───────────────┴─────────────────┴────────────────┘
```

### Next.js 코드 예시 (간략)

```typescript
// app/api/bets/route.ts
import { SuiClient } from '@mysten/sui.js/client';

export async function POST(req: Request) {
  const { roundId, prediction, amount, suiTxHash, suiBetObjectId } = await req.json();
  
  // 1. Sui 트랜잭션 검증
  const suiClient = new SuiClient({ url: SUI_RPC_URL });
  const txResponse = await suiClient.getTransactionBlock({
    digest: suiTxHash,
    options: { showEffects: true }
  });
  
  if (txResponse.effects?.status?.status !== 'success') {
    return Response.json({ error: 'Sui 트랜잭션 실패' }, { status: 400 });
  }
  
  // 2. D1에 베팅 기록
  await db.insert(bets).values({
    id: generateUUID(),
    roundId,
    userId: session.userId,
    prediction,
    amount,
    suiBetObjectId,
    suiTxHash,
    // ...
  });
  
  // 3. 라운드 풀 업데이트 (Atomic)
  await db.update(rounds)
    .set({
      totalPool: sql`total_pool + ${amount}`,
      totalGoldBets: prediction === 'GOLD' 
        ? sql`total_gold_bets + ${amount}` 
        : sql`total_gold_bets`,
      // ...
    })
    .where(eq(rounds.id, roundId));
  
  return Response.json({ success: true });
}
```

---

## 정산 플로우

### 전체 시퀀스

```
┌──────────┐     ┌─────────┐     ┌─────────┐
│ Cron Job │     │ Next.js │     │   Sui   │
└────┬─────┘     └────┬────┘     └────┬────┘
     │                │                │
     │ T+6시간        │                │
     │ 1. Round End   │                │
     │───────────────>│                │
     │                │                │
     │                │ 2. End Price   │
     │                │    스냅샷      │
     │                │                │
     │                │ 3. 승자 판정   │
     │                │   (gold vs btc)│
     │                │                │
     │                │ 4. finalize_   │
     │                │    round()     │
     │                │───────────────>│
     │                │                │
     │                │ 5. Settlement  │
     │                │    Object 생성 │
     │                │<───────────────│
     │                │                │
     │                │ 6. D1 업데이트 │
     │                │   (settlements)│
     │                │                │
     │ 7. 승자 조회   │                │
     │    (D1 query)  │                │
     │───────────────>│                │
     │                │                │
     │ 8. FOR EACH 승자:               │
     │    distribute_ │                │
     │    payout()    │                │
     │───────────────────────────────>│
     │                │                │
     │                │ 9. 배당 전송   │
     │                │<───────────────│
     │                │                │
     │ 10. D1 업데이트│                │
     │     (bets.     │                │
     │      payout)   │                │
     │───────────────>│                │
     └────────────────┴────────────────┘
```

---

## 가스비 관리 (Sponsored Transactions)

### 문제

```
유저가 DEL로 베팅하려면:
- DEL 코인 필요 ✅
- SUI 코인 필요 (가스비) ❌  ← UX 나쁨!
```

### 해결: Sponsored Transaction

**Admin Wallet이 가스비 대납**

```typescript
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

// 1. Admin Keypair 로드 (환경 변수)
const adminKeypair = Ed25519Keypair.fromSecretKey(
  Buffer.from(process.env.ADMIN_SECRET_KEY!, 'base64')
);

// 2. 유저 트랜잭션 생성
const tx = new TransactionBlock();
tx.moveCall({
  target: `${PACKAGE_ID}::betting::place_bet`,
  arguments: [
    tx.object(poolId),
    tx.pure(prediction),
    tx.object(userDelCoinId),
    tx.object('0x6'),       // Clock
  ],
});

// 3. Admin이 Sponsor로 서명 및 전송
const result = await suiClient.signAndExecuteTransactionBlock({
  transactionBlock: tx,
  signer: adminKeypair,     // ← Admin이 가스비 지불
  options: {
    showEffects: true,
    showObjectChanges: true,
  },
});
```

### 비용 산정

```
베팅 1회: ~0.001 SUI (~$0.002)
정산 1회: ~0.005 SUI (~$0.01)

하루 100 베팅 기준:
- 베팅 가스비: 0.1 SUI/day
- 정산 가스비: 0.02 SUI/day (4 라운드)
- 월간 약: 3.6 SUI (~$7)

→ 유저 수 1000명 이하면 감당 가능!
```

---

## Next.js 통합

### Sui Client 설정

```typescript
// lib/sui/client.ts
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';

export const suiClient = new SuiClient({
  url: getFullnodeUrl(
    process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet'
  ),
});

export const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID!;
```

### 베팅 헬퍼 함수

```typescript
// lib/sui/betting.ts
import { TransactionBlock } from '@mysten/sui.js/transactions';

export async function placeBetOnSui({
  poolId,
  prediction,
  userDelCoinId,
  adminKeypair
}: {
  poolId: string;
  prediction: 'GOLD' | 'BTC';
  userDelCoinId: string;
  adminKeypair: Ed25519Keypair;
}) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::betting::place_bet`,
    arguments: [
      tx.object(poolId),
      tx.pure(prediction === 'GOLD' ? 1 : 2, 'u8'),
      tx.object(userDelCoinId),
      tx.object('0x6'),   // Clock
    ],
  });
  
  const result = await suiClient.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: adminKeypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });
  
  if (result.effects?.status?.status !== 'success') {
    throw new Error('Sui 트랜잭션 실패');
  }
  
  // Bet Object ID 추출
  const betObjectChange = result.objectChanges?.find(
    (change) => change.type === 'created' && change.objectType.includes('::Bet')
  );
  
  return {
    txHash: result.digest,
    betObjectId: betObjectChange?.objectId || '',
  };
}
```

---

## 에러 처리 및 복구

### 1. Sui 트랜잭션 실패 시

**시나리오**: `place_bet()` 호출 실패

```typescript
try {
  const { txHash, betObjectId } = await placeBetOnSui({...});
} catch (error) {
  // 1. 에러 로그 기록
  console.error('Sui bet failed:', error);
  
  // 2. 유저에게 에러 반환 (D1에 기록 안 함)
  return Response.json({
    error: 'SUI_TX_FAILED',
    message: '블록체인 트랜잭션이 실패했습니다',
    details: error.message
  }, { status: 500 });
}
```

### 2. D1 저장 실패 시 (Sui 성공 후)

**시나리오**: Sui 성공 → D1 INSERT 실패

```typescript
const { txHash, betObjectId } = await placeBetOnSui({...});

try {
  await db.insert(bets).values({...});
} catch (error) {
  // 1. 에러 로그 + Slack 알림
  await sendSlackAlert({
    message: '베팅 Sui 성공, D1 저장 실패',
    txHash,
    betObjectId,
    error: error.message
  });
  
  // 2. 복구 큐에 추가 (나중에 재시도)
  await addToRecoveryQueue({
    type: 'BET_SYNC',
    txHash,
    betObjectId,
  });
  
  // 3. 유저에게 성공 반환 (Sui는 성공했으므로)
  return Response.json({
    success: true,
    txHash,
    warning: '기록 동기화 지연 중'
  });
}
```

### 3. 정산 중 실패 (일부만 배당)

**시나리오**: 100명 중 50명만 배당 → 서버 크래시

```typescript
// 서버 재시작 시 복구 로직
async function recoverIncompleteSettlements() {
  // 1. CALCULATING 상태인 라운드 찾기
  const incompleteRounds = await db.select()
    .from(rounds)
    .where(eq(rounds.status, 'CALCULATING'));
  
  for (const round of incompleteRounds) {
    // 2. 미정산 베팅 찾기
    const pendingBets = await db.select()
      .from(bets)
      .where(
        and(
          eq(bets.roundId, round.id),
          eq(bets.settlementStatus, 'PENDING')
        )
      );
    
    // 3. 각 베팅에 대해 재정산
    for (const bet of pendingBets) {
      try {
        await distributePayout(round, bet);
      } catch (error) {
        console.error(`Failed to settle bet ${bet.id}:`, error);
        // 실패 로그만 기록, 계속 진행
      }
    }
  }
}
```

---

## 테스트 전략

### 1. Move 단위 테스트

```rust
// tests/betting_tests.move
#[test]
fun test_place_bet() {
    let scenario = test_scenario::begin(@admin);
    
    // 1. 풀 생성
    {
        let ctx = test_scenario::ctx(&mut scenario);
        betting::create_pool(
            1,          // round_id
            b"6HOUR",
            1700000000, // start
            1700021600, // end
            1700000060, // lock
            @admin,
            ctx
        );
    };
    
    // 2. 베팅 생성
    test_scenario::next_tx(&mut scenario, @user1);
    {
        let pool = test_scenario::take_shared<BettingPool>(&scenario);
        let payment = coin::mint_for_testing<DEL>(1000, test_scenario::ctx(&mut scenario));
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        
        betting::place_bet(
            &mut pool,
            1,          // GOLD
            payment,
            &clock,
            test_scenario::ctx(&mut scenario)
        );
        
        // 검증
        assert!(betting::total_pool(&pool) == 1000, 0);
        assert!(betting::gold_pool(&pool) == 1000, 1);
        
        test_scenario::return_shared(pool);
        clock::destroy_for_testing(clock);
    };
    
    test_scenario::end(scenario);
}
```

### 2. Next.js 통합 테스트

```typescript
// __tests__/api/bets.test.ts
import { POST } from '@/app/api/bets/route';

describe('POST /api/bets', () => {
  it('should create bet when valid', async () => {
    const request = new Request('http://localhost/api/bets', {
      method: 'POST',
      body: JSON.stringify({
        roundId: 'uuid',
        prediction: 'GOLD',
        amount: 1000,
        suiTxHash: 'mock_tx_hash',
        suiBetObjectId: 'mock_bet_id',
      }),
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(data.success).toBe(true);
    expect(data.data.bet.amount).toBe(1000);
  });
  
  it('should fail when round is locked', async () => {
    // ...
  });
});
```

---

## 보안 고려사항

### 1. Admin Keypair 관리

**❌ 절대 하지 말 것**
- Git에 커밋
- 프론트엔드 노출
- 로그에 출력

**✅ 권장 사항**
```bash
# .env (gitignore 필수)
ADMIN_SECRET_KEY=base64_encoded_key

# Cloudflare Workers Secrets
wrangler secret put ADMIN_SECRET_KEY
```

### 2. Sui 트랜잭션 검증

**프론트엔드에서 받은 tx_hash를 무조건 검증**
```typescript
// 1. 트랜잭션 조회
const txResponse = await suiClient.getTransactionBlock({
  digest: suiTxHash,
  options: { showEffects: true, showObjectChanges: true }
});

// 2. 성공 여부 확인
if (txResponse.effects?.status?.status !== 'success') {
  throw new Error('Invalid transaction');
}

// 3. 베팅 내용 검증 (금액, 예측 등)
const betEvent = txResponse.events?.find(e => 
  e.type.includes('::BetPlaced')
);

if (betEvent.parsedJson.amount !== amount) {
  throw new Error('Amount mismatch');
}
```

### 3. Rate Limiting

**Sponsored Transaction 남용 방지**
```typescript
// lib/rate-limit.ts
const rateLimiter = new Map<string, number[]>();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const window = 60 * 1000;  // 1분
  const maxRequests = 10;    // 최대 10 베팅/분
  
  const timestamps = rateLimiter.get(userId) || [];
  const recentTimestamps = timestamps.filter(t => now - t < window);
  
  if (recentTimestamps.length >= maxRequests) {
    return false;  // Rate limit exceeded
  }
  
  recentTimestamps.push(now);
  rateLimiter.set(userId, recentTimestamps);
  
  return true;
}
```

---

## 요약

### Sui 통합 체크리스트

- [ ] Move 패키지 배포 (Testnet/Mainnet)
- [ ] Admin Keypair 생성 및 환경 변수 설정
- [ ] TreasuryCap 획득 (DEL Coin)
- [ ] Next.js Sui Client 설정
- [ ] Sponsored Transaction 구현
- [ ] 베팅 플로우 테스트
- [ ] 정산 플로우 테스트
- [ ] 에러 처리 및 복구 로직 구현
- [ ] 보안 검증 (Rate Limit, Tx Verification)

### 예상 일정

| Week | Task                         |
| ---- | ---------------------------- |
| 1    | Move 컨트랙트 작성 및 테스트 |
| 2    | Next.js 통합 (베팅)          |
| 3    | Next.js 통합 (정산)          |
| 4    | 전체 플로우 테스트 및 최적화 |

---
