module deltax::betting;

use deltax::del_coin::DEL_COIN;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// Errors
const E_BETTING_CLOSED: u64 = 1;
const E_INVALID_PREDICTION: u64 = 2;
const E_INSUFFICIENT_AMOUNT: u64 = 3;
const E_POOL_NOT_OPEN: u64 = 5;
const E_TOO_LATE: u64 = 6;

// Constants
const STATUS_OPEN: u8 = 1;
const STATUS_LOCKED: u8 = 2;
const STATUS_SETTLED: u8 = 3;

const PREDICTION_GOLD: u8 = 1;
const PREDICTION_BTC: u8 = 2;

const MIN_BET_AMOUNT: u64 = 100_000_000_000; // 100 DEL

/// Admin capability
public struct AdminCap has key, store {
    id: UID,
}

/// Betting Pool (Shared Object)
public struct BettingPool has key {
    id: UID,
    round_id: u64,
    // Balances
    gold_balance: Balance<DEL_COIN>,
    btc_balance: Balance<DEL_COIN>,
    // Stats
    total_pool: u64,
    gold_pool: u64,
    btc_pool: u64,
    bet_count: u64,
    // Status
    status: u8,
    // Times
    lock_time: u64,
    end_time: u64,
}

/// Individual Bet (Owned Object)
public struct Bet has key, store {
    id: UID,
    pool_id: ID,
    user: address,
    prediction: u8,
    amount: u64,
    timestamp: u64,
}

/// Events
public struct BetPlaced has copy, drop {
    bet_id: ID,
    pool_id: ID,
    user: address,
    prediction: u8,
    amount: u64,
    timestamp: u64,
}

public struct PoolStatusChanged has copy, drop {
    pool_id: ID,
    round_id: u64,
    old_status: u8,
    new_status: u8,
    timestamp: u64,
}

fun init(ctx: &mut TxContext) {
    let admin_cap = AdminCap {
        id: object::new(ctx),
    };
    transfer::public_transfer(admin_cap, tx_context::sender(ctx));
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}

/// Create a new betting pool
public fun create_pool(
    _: &AdminCap,
    round_id: u64,
    lock_time: u64,
    end_time: u64,
    ctx: &mut TxContext,
): ID {
    let id = object::new(ctx);
    let pool_id = object::uid_to_inner(&id);

    let pool = BettingPool {
        id,
        round_id,
        gold_balance: balance::zero(),
        btc_balance: balance::zero(),
        total_pool: 0,
        gold_pool: 0,
        btc_pool: 0,
        bet_count: 0,
        status: STATUS_OPEN,
        lock_time,
        end_time,
    };

    transfer::share_object(pool);
    pool_id
}

/// Place a bet
public fun place_bet(
    pool: &mut BettingPool,
    user: address,
    prediction: u8,
    mut payment: Coin<DEL_COIN>,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    // Checks
    assert!(pool.status == STATUS_OPEN, E_POOL_NOT_OPEN);
    assert!(clock.timestamp_ms() < pool.lock_time * 1000, E_TOO_LATE);
    assert!(prediction == PREDICTION_GOLD || prediction == PREDICTION_BTC, E_INVALID_PREDICTION);

    let amount = payment.value();
    assert!(amount >= MIN_BET_AMOUNT, E_INSUFFICIENT_AMOUNT);

    // Update Pool
    if (prediction == PREDICTION_GOLD) {
        pool.gold_pool = pool.gold_pool + amount;
        balance::join(&mut pool.gold_balance, payment.into_balance());
    } else {
        pool.btc_pool = pool.btc_pool + amount;
        balance::join(&mut pool.btc_balance, payment.into_balance());
    };

    pool.total_pool = pool.total_pool + amount;
    pool.bet_count = pool.bet_count + 1;

    // Create Bet Object
    let id = object::new(ctx);
    let bet_id = object::uid_to_inner(&id);
    let timestamp = clock.timestamp_ms();

    let bet = Bet {
        id,
        pool_id: object::id(pool),
        user,
        prediction,
        amount,
        timestamp,
    };

    // Emit Event
    event::emit(BetPlaced {
        bet_id,
        pool_id: object::id(pool),
        user,
        prediction,
        amount,
        timestamp,
    });

    // Transfer Bet to user (even if sponsored tx)
    transfer::public_transfer(bet, user);

    bet_id
}

/// Lock the pool
public fun lock_pool(_: &AdminCap, pool: &mut BettingPool, clock: &Clock) {
    let old_status = pool.status;
    pool.status = STATUS_LOCKED;

    event::emit(PoolStatusChanged {
        pool_id: object::id(pool),
        round_id: pool.round_id,
        old_status,
        new_status: STATUS_LOCKED,
        timestamp: clock.timestamp_ms(),
    });
}

/// Get pool stats
public fun get_pool_stats(pool: &BettingPool): (u64, u64, u64, u64) {
    (pool.total_pool, pool.gold_pool, pool.btc_pool, pool.bet_count)
}

/// Get round ID
public fun round_id(pool: &BettingPool): u64 { pool.round_id }

// Friend functions for settlement
public(package) fun update_status_settled(pool: &mut BettingPool) {
    pool.status = STATUS_SETTLED;
}

public(package) fun take_payout(pool: &mut BettingPool, amount: u64): Balance<DEL_COIN> {
    let gold_val = balance::value(&pool.gold_balance);
    let btc_val = balance::value(&pool.btc_balance);

    if (gold_val >= amount) {
        balance::split(&mut pool.gold_balance, amount)
    } else if (btc_val >= amount) {
        balance::split(&mut pool.btc_balance, amount)
    } else {
        // Need to take from both
        let mut res = balance::split(&mut pool.gold_balance, gold_val);
        let remaining = amount - gold_val;
        balance::join(&mut res, balance::split(&mut pool.btc_balance, remaining));
        res
    }
}

public(package) fun take_all_balance(
    pool: &mut BettingPool,
): (Balance<DEL_COIN>, Balance<DEL_COIN>) {
    let gold = balance::withdraw_all(&mut pool.gold_balance);
    let btc = balance::withdraw_all(&mut pool.btc_balance);
    (gold, btc)
}

// Accessors for settlement
public fun bet_amount(bet: &Bet): u64 { bet.amount }

public fun bet_prediction(bet: &Bet): u8 { bet.prediction }

public fun bet_user(bet: &Bet): address { bet.user }

public fun bet_pool_id(bet: &Bet): ID { bet.pool_id }

// Burn bet object after settlement
public(package) fun burn_bet(bet: Bet) {
    let Bet { id, pool_id: _, user: _, prediction: _, amount: _, timestamp: _ } = bet;
    object::delete(id);
}
