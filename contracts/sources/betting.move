module deltax::betting;

use deltax::del::DEL;
use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;

const STATUS_OPEN: u8 = 1;
const STATUS_LOCKED: u8 = 2;
const STATUS_SETTLED: u8 = 3;

// 예측
const PREDICTION_GOLD: u8 = 1;
const PREDICTION_BTC: u8 = 2;

// 결과
const WINNER_GOLD: u8 = 1;
const WINNER_BTC: u8 = 2;

// 설정
const MIN_BET_AMOUNT: u64 = 100_000_000_000; // 100 DEL
const PLATFORM_FEE_RATE: u64 = 5; // 5%
const RATIO_SCALE: u64 = 100;

// 에러 코드
const E_POOL_NOT_OPEN: u64 = 1;
const E_BETTING_CLOSED: u64 = 2;
const E_INVALID_PREDICTION: u64 = 3;
const E_INSUFFICIENT_AMOUNT: u64 = 4;
const E_UNAUTHORIZED: u64 = 5;
const E_TOO_LATE: u64 = 6;
const E_NOT_LOCKED: u64 = 10;
const E_TOO_EARLY: u64 = 11;
const E_ALREADY_SETTLED: u64 = 12;
const E_NOT_WINNER: u64 = 13;
const E_ROUND_MISMATCH: u64 = 14;

// ============ Structs ============

/// Admin 권한 증명
/// - 패키지 배포 시 생성되어 Admin에게 전송
/// - Pool 생성, 잠금, 정산 등 관리자 함수 호출 시 필요
public struct AdminCap has key, store {
    id: UID,
}

/// 라운드별 베팅 풀 (Shared Object)
/// - 모든 유저가 접근해야 하므로 Shared
/// - DEL 토큰을 Balance로 보관
public struct BettingPool has key {
    id: UID,
    round_id: u64,
    // 잔액 (Balance = 내부 저장용, Coin과 다름)
    gold_balance: Balance<DEL>,
    btc_balance: Balance<DEL>,
    // 통계
    total_pool: u64,
    gold_pool: u64,
    btc_pool: u64,
    bet_count: u64,
    // 상태: 1=OPEN, 2=LOCKED, 3=SETTLED
    status: u8,
    // 시간 (Unix timestamp, MS)
    lock_time: u64,
    end_time: u64,
}

/// 개별 베팅 (Owned Object)
/// - 베팅한 유저가 소유
/// - 정산 시 이 객체를 제출해서 배당 수령
public struct Bet has key, store {
    id: UID,
    pool_id: ID, // 소속 Pool
    user: address, // 베팅 유저
    prediction: u8, // 1=GOLD, 2=BTC
    amount: u64, // 베팅 금액
    timestamp: u64, // 베팅 시간
}

/// 정산 결과 기록 (Shared Object)
/// - 라운드 종료 후 생성
/// - 승자, 배당률 등 기록
public struct Settlement has key {
    id: UID,
    pool_id: ID,
    round_id: u64,
    // 가격 데이터 (소수점 2자리 → *100)
    gold_start: u64,
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,
    // 결과
    winner: u8, // 1=GOLD, 2=BTC (동점 시 GOLD 승리)
    // 풀 정보
    total_pool: u64,
    winning_pool: u64,
    platform_fee: u64,
    payout_ratio: u64, // 178 = 1.78x
    // 메타
    settled_at: u64,
}

// events

/// 베팅 생성 이벤트
public struct BetPlaced has copy, drop {
    bet_id: ID,
    pool_id: ID,
    user: address,
    prediction: u8,
    amount: u64,
    timestamp: u64,
}

/// 정산 완료 이벤트
public struct SettlementCreated has copy, drop {
    settlement_id: ID,
    pool_id: ID,
    round_id: u64,
    winner: u8,
    payout_ratio: u64,
    settled_at: u64,
}

/// 배당 전송 이벤트
public struct PayoutDistributed has copy, drop {
    settlement_id: ID,
    bet_id: ID,
    user: address,
    amount: u64,
    timestamp: u64,
}

/// 풀 상태 변경 이벤트
public struct PoolStatusChanged has copy, drop {
    pool_id: ID,
    round_id: u64,
    old_status: u8,
    new_status: u8,
    timestamp: u64,
}

// ============ Init ============

/// 패키지 배포 시 자동 호출
/// AdminCap을 생성해서 배포자에게 전송
fun init(ctx: &mut TxContext) {
    // AdminCap 생성 (id는 object::new로 생성)
    let admin_cap = AdminCap {
        id: object::new(ctx),
    };
    // 배포자(sender)에게 전송
    transfer::transfer(admin_cap, ctx.sender());
}

// ============ Public Functions ============

/// 새 베팅 풀 생성 (Admin 전용)
///
/// 언제 호출?
/// - Next.js Cron Job이 새 라운드 시작할 때
/// - 예: 6시간 라운드 → 02:00, 08:00, 14:00, 20:00
///
/// # Arguments
/// - `_admin`: AdminCap 참조 (권한 확인용, 값은 안 씀)
/// - `round_id`: 라운드 번호 (D1 rounds 테이블의 ID와 매칭)
/// - `lock_time`: 베팅 마감 시간 (Unix timestamp, 밀리초)
/// - `end_time`: 라운드 종료 시간 (Unix timestamp, 밀리초)
///
/// # Returns
/// - 생성된 Pool의 ID (D1에 저장해서 나중에 참조)
///
/// # 주의
/// - AdminCap 없으면 호출 불가 (트랜잭션 실패)
/// - Pool은 Shared Object로 생성됨 → 모든 유저가 베팅 가능
public fun create_pool(
    _admin: &AdminCap, // 언더스코어 prefix (권한 체크용)
    round_id: u64,
    lock_time: u64,
    end_time: u64,
    ctx: &mut TxContext,
): ID {
    // 1. BettingPool 객체 생성
    let pool = BettingPool {
        id: object::new(ctx), // 고유 ID 생성
        round_id, // 라운드 번호
        // Balance는 비어있는 상태로 시작
        // balance::zero<T>() = 0인 Balance 생성
        gold_balance: balance::zero<DEL>(),
        btc_balance: balance::zero<DEL>(),
        // 통계 초기화
        total_pool: 0,
        gold_pool: 0,
        btc_pool: 0,
        bet_count: 0,
        // 상태: OPEN (베팅 가능)
        status: STATUS_OPEN,
        // 시간 설정
        lock_time,
        end_time,
    };

    // 2. Pool ID 미리 저장 (share 후에는 접근 불가)
    let pool_id = object::id(&pool);

    // 3. Shared Object로 만들기
    // transfer::share_object() → 누구나 접근 가능한 공유 객체
    // (Owned Object와 다름!)
    transfer::share_object(pool);

    // 4. Pool ID 반환 (Next.js에서 D1에 저장)
    pool_id
}

/// # 베팅하기
///
/// ## 흐름
/// 1. 검증: 풀 상태, 시간, 예측값, 최소금액
/// 2. Coin → Balance 변환 → Pool에 추가
/// 3. 통계 업데이트
/// 4. Bet 객체 생성 → 유저에게 전송
///
/// ## Arguments
/// - `pool`: 베팅할 Pool (Shared Object, 수정 가능)
/// - `user`: 실제 베팅 유저 주소 (Sponsored TX여도 진짜 유저)
/// - `prediction`: 1=GOLD, 2=BTC
/// - `payment`: 베팅할 DEL 코인 (소유권 이전됨 = 소비됨)
/// - `clock`: Sui 시스템 Clock (현재 시간 확인용)
///
/// ## Returns
/// - 생성된 Bet의 ID
///
/// ## Errors
/// - E_POOL_NOT_OPEN: 풀이 OPEN 상태가 아님
/// - E_TOO_LATE: 베팅 마감 시간 지남
/// - E_INVALID_PREDICTION: prediction이 1 또는 2가 아님
/// - E_INSUFFICIENT_AMOUNT: 최소 베팅액(100 DEL) 미만
public fun place_bet(
    pool: &mut BettingPool,
    user: address,
    prediction: u8,
    payment: Coin<DEL>,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let now = clock::timestamp_ms(clock);
    // 1. 검증
    // 풀이 열려있는지
    assert!(pool.status == STATUS_OPEN, E_POOL_NOT_OPEN);
    // 베팅 마감 전인지
    assert!(now < pool.lock_time, E_TOO_LATE);
    // 유효한 예측인지
    assert!(prediction == PREDICTION_GOLD || prediction == PREDICTION_BTC, E_INVALID_PREDICTION);
    // 최소 베팅액 이상인지
    let amount = coin::value(&payment);
    assert!(amount >= MIN_BET_AMOUNT, E_INSUFFICIENT_AMOUNT);

    // 2. Coin → Balance로 변환해서 Pool에 추가
    let bet_balance = coin::into_balance(payment);

    if (prediction == PREDICTION_GOLD) {
        balance::join(&mut pool.gold_balance, bet_balance);
        pool.gold_pool = pool.gold_pool + amount;
    } else {
        balance::join(&mut pool.btc_balance, bet_balance); // ← btc_balance!
        pool.btc_pool = pool.btc_pool + amount;
    };

    // 3. 통계 업데이트 (total_pool, gold/btc_pool, bet_count)
    pool.total_pool = pool.total_pool + amount;
    pool.bet_count = pool.bet_count + 1;

    // 4. Bet 객체 생성 → user에게 전송
    let bet = Bet {
        id: object::new(ctx),
        pool_id: object::id(pool),
        user,
        prediction,
        amount,
        timestamp: now,
    };
    let bet_id = object::id(&bet);
    transfer::transfer(bet, user);

    // 5. Event emit
    event::emit(BetPlaced {
        bet_id,
        pool_id: object::id(pool),
        user,
        prediction,
        amount,
        timestamp: now,
    });

    // 6. Bet ID 반환
    bet_id
}

/// # 베팅 마감 (Admin 전용)
///
/// ## 언제 호출?
/// - 라운드 종료 5분 전 (lock_time 도달 시)
/// - Cron Job이 호출
///
/// ## 흐름
/// 1. 검증: 풀이 OPEN 상태인지, lock_time 지났는지
/// 2. 상태 변경: OPEN → LOCKED
///
/// ## Arguments
/// - `_admin`: AdminCap 참조 (권한 확인용)
/// - `pool`: 잠글 Pool
/// - `clock`: 현재 시간 확인용
///
/// ## Errors
/// - E_POOL_NOT_OPEN: 이미 LOCKED거나 SETTLED
/// - E_TOO_EARLY: lock_time 전에 호출함
public fun lock_pool(_admin: &AdminCap, pool: &mut BettingPool, clock: &Clock) {
    let now = clock::timestamp_ms(clock);

    // 1. 검증
    // 풀이 OPEN 상태여야 함
    assert!(pool.status == STATUS_OPEN, E_POOL_NOT_OPEN);
    // lock_time이 지났어야 함 (너무 일찍 잠그면 안 됨)
    assert!(now >= pool.lock_time, E_TOO_EARLY);

    // 2. 상태 변경
    let old_status = pool.status;
    pool.status = STATUS_LOCKED;

    // 3. Event emit
    event::emit(PoolStatusChanged {
        pool_id: object::id(pool),
        round_id: pool.round_id,
        old_status,
        new_status: STATUS_LOCKED,
        timestamp: now,
    });
}

/// # 라운드 정산 (Admin 전용)
///
/// ## 언제 호출?
/// - 라운드 종료 시간(end_time) 이후
/// - Cron Job이 가격 데이터와 함께 호출
///
/// ## 흐름
/// 1. 검증: LOCKED 상태, end_time 지남
/// 2. 승자 결정: 변동률 비교 (동점 시 GOLD)
/// 3. 배당 계산: 수수료 5% 제외 후 비율 계산
/// 4. Settlement 생성 → Shared Object
/// 5. 상태 변경: LOCKED → SETTLED
///
/// ## Arguments
/// - `_admin`: AdminCap 참조
/// - `pool`: 정산할 Pool
/// - `gold_start/end`: 금 시작/종료 가격 (*100, 소수점 2자리)
/// - `btc_start/end`: BTC 시작/종료 가격 (*100)
/// - `clock`: 현재 시간
///
/// ## Returns
/// - `(ID, Coin<DEL>)`: (Settlement ID, Platform Fee Coin)
///   - 호출자가 fee_coin을 Admin에게 transfer해야 함
///
/// ## Errors
/// - E_NOT_LOCKED: LOCKED 상태가 아님
/// - E_TOO_EARLY: end_time 전에 호출함
public fun finalize_round(
    _admin: &AdminCap,
    pool: &mut BettingPool,
    gold_start: u64,
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ID, Coin<DEL>) {
    let now = clock::timestamp_ms(clock);
    // 1. 검증
    assert!(pool.status == STATUS_LOCKED, E_NOT_LOCKED);
    assert!(now >= pool.end_time, E_TOO_EARLY);

    // 2. 승자 결정
    // 가격이 올랐는지 확인
    let gold_went_up = gold_end >= gold_start;
    let btc_went_up = btc_end >= btc_start;

    // 변동폭 계산 (절대값)
    let gold_change = if (gold_went_up) {
        gold_end - gold_start
    } else {
        gold_start - gold_end
    };

    let btc_change = if (btc_went_up) {
        btc_end - btc_start
    } else {
        btc_start - btc_end
    };

    let gold_score = gold_change * btc_start;
    let btc_score = btc_change * gold_start;

    // 승자 결정
    // 현재 변동률이 더 큰 쪽이 승리
    let winner = if (gold_score >= btc_score) {
        WINNER_GOLD // 동점 시 GOLD
    } else {
        WINNER_BTC
    };

    // 3. 배당 계산
    // 승자 풀 금액
    // 승자 풀에 패자 풀 합침
    let winning_pool = if (winner == WINNER_GOLD) {
        let btc_all = balance::withdraw_all(&mut pool.btc_balance);
        balance::join(&mut pool.gold_balance, btc_all);
        pool.gold_pool
    } else {
        let gold_all = balance::withdraw_all(&mut pool.gold_balance);
        balance::join(&mut pool.btc_balance, gold_all);
        pool.btc_pool
    };

    // 플랫폼 수수료 (5%)
    let platform_fee = pool.total_pool * PLATFORM_FEE_RATE / 100;

    // fee coin 생성 (호출자가 Admin에게 transfer)
    let fee_coin = if (platform_fee > 0) {
        let fee_balance = if (winner == WINNER_GOLD) {
            balance::split(&mut pool.gold_balance, platform_fee)
        } else {
            balance::split(&mut pool.btc_balance, platform_fee)
        };
        coin::from_balance(fee_balance, ctx)
    } else {
        coin::zero<DEL>(ctx)
    };

    // 배당 풀 (총액 - 수수료)
    let payout_pool = pool.total_pool - platform_fee;

    // 배당률 (예: 178 = 1.78배)
    // 승자 풀이 0이면 divide by zero 방지
    let payout_ratio = if (winning_pool > 0) {
        payout_pool * RATIO_SCALE / winning_pool
    } else {
        0
    };

    // 4. Settlement 생성
    let settlement = Settlement {
        id: object::new(ctx),
        pool_id: object::id(pool),
        round_id: pool.round_id,
        gold_start,
        gold_end,
        btc_start,
        btc_end,
        winner,
        total_pool: pool.total_pool,
        winning_pool,
        platform_fee,
        payout_ratio,
        settled_at: now,
    };

    // Settlement ID 저장 (share 전에!)
    let settlement_id = object::id(&settlement);

    // Shared Object로 만들기 (누구나 조회 가능)
    transfer::share_object(settlement);

    // 5. 상태 변경
    pool.status = STATUS_SETTLED;

    // 6. Event emit
    event::emit(SettlementCreated {
        settlement_id,
        pool_id: object::id(pool),
        round_id: pool.round_id,
        winner,
        payout_ratio,
        settled_at: now,
    });

    // 7. 튜플 반환 (Settlement ID, Fee Coin)
    // 호출자(Next.js)가 fee_coin을 Admin에게 transfer해야 함
    (settlement_id, fee_coin)
}

/// # 배당 전송 (Admin 전용)
///
/// ## 언제 호출?
/// - 라운드 정산(finalize_round) 완료 후
/// - 각 Bet에 대해 개별적으로 호출 (Cron Job이 순회)
///
/// ## 흐름
/// 1. 검증: Pool이 SETTLED 상태인지, 같은 라운드인지
/// 2. 배당금 계산: 승자면 bet.amount * payout_ratio, 패자면 0
/// 3. Bet 소각: 소유권 이전받은 Bet 객체 삭제 (재사용 방지)
/// 4. 배당금 전송: Pool balance에서 payout 만큼 분리 → Coin 반환
///
/// ## Arguments
/// - `_admin`: AdminCap 참조 (권한 확인용)
/// - `pool`: 정산된 Pool (balance에서 payout 차감)
/// - `settlement`: 정산 결과 (승자, 배당률 정보)
/// - `bet`: 처리할 Bet (소유권 이전 → 함수 내에서 소각)
/// - `ctx`: 트랜잭션 컨텍스트 (Coin 생성용)
///
/// ## Returns
/// - `Coin<DEL>`: 배당금 (승자) 또는 0 DEL (패자)
///   - 호출자(Admin/Cron)가 이 Coin을 유저에게 transfer 해야 함
///
/// ## Errors
/// - E_ALREADY_SETTLED: Pool이 SETTLED 상태가 아님 (오류 네이밍 주의)
/// - E_ROUND_MISMATCH: bet과 settlement의 라운드가 다름
///
/// ## 주의
/// - Bet 객체는 이 함수 호출 후 소각됨 (재사용 불가)
/// - 패자도 이 함수를 통해 처리해야 Bet이 정리됨
public fun distribute_payout(
    _admin: &AdminCap,
    pool: &mut BettingPool,
    settlement: &Settlement,
    bet: Bet,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<DEL> {
    // 1. 검증
    // Pool이 정산 완료 상태인지 확인
    assert!(pool.status == STATUS_SETTLED, E_ALREADY_SETTLED);
    // Bet이 이 라운드에 속하는지 확인
    assert!(pool.round_id == settlement.round_id, E_ROUND_MISMATCH);

    // 2. 배당금 계산 (소각 전에 필요한 값 추출)
    let now = clock::timestamp_ms(clock);
    let winner = settlement.winner;
    let bet_id = object::id(&bet);
    let bet_user = bet.user;
    let payout = if (bet.prediction == winner) {
        bet.amount * settlement.payout_ratio / RATIO_SCALE
    } else {
        0
    };

    // 3. Bet 소각
    // Move의 linear type: drop trait 없으면 명시적으로 처리해야 함
    // destructure로 분해 → UID만 delete
    let Bet { id, pool_id: _, user: _, prediction: _, amount: _, timestamp: _ } = bet;
    object::delete(id);

    // 4. 배당금 전송
    // 패자는 0 코인 반환
    if (payout == 0) {
        return coin::zero<DEL>(ctx)
    };

    // 승자는 winning balance에서 payout 분리
    let payout_balance = if (winner == WINNER_GOLD) {
        balance::split(&mut pool.gold_balance, payout)
    } else {
        balance::split(&mut pool.btc_balance, payout)
    };

    // Balance → Coin 변환
    let payout_coin = coin::from_balance(payout_balance, ctx);

    // 5. Event emit
    event::emit(PayoutDistributed {
        settlement_id: object::id(settlement),
        bet_id,
        user: bet_user,
        amount: payout,
        timestamp: now,
    });

    payout_coin
}

// ============ Test-only Functions ============

#[test_only]
/// 테스트용 init 호출 헬퍼
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}

#[test_only]
/// Pool 상태 조회 (테스트용)
public fun get_pool_status(pool: &BettingPool): u8 {
    pool.status
}

#[test_only]
/// Pool 통계 조회 (테스트용)
/// Returns: (total_pool, gold_pool, btc_pool, bet_count)
public fun get_pool_stats(pool: &BettingPool): (u64, u64, u64, u64) {
    (pool.total_pool, pool.gold_pool, pool.btc_pool, pool.bet_count)
}

#[test_only]
/// Pool round_id 조회 (테스트용)
public fun get_pool_round_id(pool: &BettingPool): u64 {
    pool.round_id
}

#[test_only]
/// Pool 시간 조회 (테스트용)
/// Returns: (lock_time, end_time)
public fun get_pool_times(pool: &BettingPool): (u64, u64) {
    (pool.lock_time, pool.end_time)
}

#[test_only]
/// Settlement 승자 조회 (테스트용)
public fun get_settlement_winner(settlement: &Settlement): u8 {
    settlement.winner
}

#[test_only]
/// Settlement 배당률 조회 (테스트용)
public fun get_settlement_payout_ratio(settlement: &Settlement): u64 {
    settlement.payout_ratio
}

#[test_only]
/// Settlement 수수료 조회 (테스트용)
public fun get_settlement_platform_fee(settlement: &Settlement): u64 {
    settlement.platform_fee
}

#[test_only]
/// Settlement round_id 조회 (테스트용)
public fun get_settlement_round_id(settlement: &Settlement): u64 {
    settlement.round_id
}

#[test_only]
/// Bet 정보 조회 (테스트용)
/// Returns: (user, prediction, amount)
public fun get_bet_info(bet: &Bet): (address, u8, u64) {
    (bet.user, bet.prediction, bet.amount)
}

#[test_only]
/// 상수 노출 (테스트용)
public fun status_open(): u8 { STATUS_OPEN }

#[test_only]
public fun status_locked(): u8 { STATUS_LOCKED }

#[test_only]
public fun status_settled(): u8 { STATUS_SETTLED }

#[test_only]
public fun prediction_gold(): u8 { PREDICTION_GOLD }

#[test_only]
public fun prediction_btc(): u8 { PREDICTION_BTC }

#[test_only]
public fun winner_gold(): u8 { WINNER_GOLD }

#[test_only]
public fun winner_btc(): u8 { WINNER_BTC }

#[test_only]
public fun min_bet_amount(): u64 { MIN_BET_AMOUNT }

#[test_only]
public fun e_pool_not_open(): u64 { E_POOL_NOT_OPEN }

#[test_only]
public fun e_invalid_prediction(): u64 { E_INVALID_PREDICTION }

#[test_only]
public fun e_insufficient_amount(): u64 { E_INSUFFICIENT_AMOUNT }

#[test_only]
public fun e_too_late(): u64 { E_TOO_LATE }

#[test_only]
public fun e_not_locked(): u64 { E_NOT_LOCKED }

#[test_only]
public fun e_too_early(): u64 { E_TOO_EARLY }

#[test_only]
public fun e_already_settled(): u64 { E_ALREADY_SETTLED }

#[test_only]
public fun e_round_mismatch(): u64 { E_ROUND_MISMATCH }
