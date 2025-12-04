module deltax::betting;

use deltax::del::DEL;
use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};

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

/// 베팅하기
///
/// # 흐름
/// 1. 검증: 풀 상태, 시간, 예측값, 최소금액
/// 2. Coin → Balance 변환 → Pool에 추가
/// 3. 통계 업데이트
/// 4. Bet 객체 생성 → 유저에게 전송
///
/// # Arguments
/// - `pool`: 베팅할 Pool (Shared Object, 수정 가능)
/// - `user`: 실제 베팅 유저 주소 (Sponsored TX여도 진짜 유저)
/// - `prediction`: 1=GOLD, 2=BTC
/// - `payment`: 베팅할 DEL 코인 (소유권 이전됨 = 소비됨)
/// - `clock`: Sui 시스템 Clock (현재 시간 확인용)
///
/// # Returns
/// - 생성된 Bet의 ID
///
/// # Errors
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
    // 5. Bet ID 반환
    bet_id
}
