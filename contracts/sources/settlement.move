module deltax::settlement;

use deltax::betting::{Self, AdminCap, BettingPool, Bet};
use deltax::del_coin::DEL_COIN;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// Errors
const E_NOT_LOCKED: u64 = 10;
const E_TOO_EARLY: u64 = 11;
const E_ALREADY_SETTLED: u64 = 12;
const E_NOT_WINNER: u64 = 13;
const E_ROUND_MISMATCH: u64 = 14;

// Constants
const WINNER_GOLD: u8 = 1;
const WINNER_BTC: u8 = 2;
const WINNER_DRAW: u8 = 3;

const PLATFORM_FEE_RATE: u64 = 5; // 5%
const RATIO_SCALE: u64 = 100;

/// Settlement Record (Shared Object)
public struct Settlement has key {
    id: UID,
    pool_id: ID,
    round_id: u64,
    gold_start: u64,
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,
    winner: u8,
    total_pool: u64,
    winning_pool: u64,
    platform_fee: u64,
    payout_ratio: u64,
    settled_at: u64,
}

/// Events
public struct SettlementCreated has copy, drop {
    settlement_id: ID,
    pool_id: ID,
    round_id: u64,
    winner: u8,
    payout_ratio: u64,
    settled_at: u64,
}

public struct PayoutDistributed has copy, drop {
    settlement_id: ID,
    bet_id: ID,
    user: address,
    amount: u64,
    timestamp: u64,
}

public struct RefundProcessed has copy, drop {
    pool_id: ID,
    bet_id: ID,
    user: address,
    amount: u64,
    timestamp: u64,
}

/// Finalize the round
public fun finalize_round(
    _: &AdminCap,
    pool: &mut BettingPool,
    gold_start: u64,
    gold_end: u64,
    btc_start: u64,
    btc_end: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    // Calculate winner
    // Logic: Compare percentage change? Or just simple price diff?
    // Assuming simple price diff for now based on spec implication, but usually it's % change.
    // Let's assume the spec implies comparing the price movement.
    // If (gold_end - gold_start) / gold_start > (btc_end - btc_start) / btc_start ...
    // To avoid float, we compare: (gold_end * btc_start) vs (btc_end * gold_start) if both up.
    // For simplicity and robustness, let's calculate the ratio of change.
    // change_gold = gold_end * 10000 / gold_start
    // change_btc = btc_end * 10000 / btc_start

    let gold_ratio = (gold_end as u128) * 10000 / (gold_start as u128);
    let btc_ratio = (btc_end as u128) * 10000 / (btc_start as u128);

    let winner = if (gold_ratio > btc_ratio) {
        WINNER_GOLD
    } else if (btc_ratio > gold_ratio) {
        WINNER_BTC
    } else {
        WINNER_DRAW
    };

    // Get pool stats
    let (total, gold_pool, btc_pool, _) = betting::get_pool_stats(pool);

    let winning_pool_amount = if (winner == WINNER_GOLD) { gold_pool } else if (
        winner == WINNER_BTC
    ) { btc_pool } else { 0 };

    // Calculate Fee & Payout Ratio
    let mut platform_fee = 0;
    let mut payout_ratio = 0;

    if (winner != WINNER_DRAW && winning_pool_amount > 0) {
        platform_fee = total * PLATFORM_FEE_RATE / 100;
        let distributable = total - platform_fee;
        // Ratio = (Distributable * Scale) / WinningPool
        payout_ratio = distributable * RATIO_SCALE / winning_pool_amount;
    };

    let id = object::new(ctx);
    let settlement_id = object::uid_to_inner(&id);
    let settled_at = clock.timestamp_ms();

    let settlement = Settlement {
        id,
        pool_id: object::id(pool),
        round_id: betting::round_id(pool),
        gold_start,
        gold_end,
        btc_start,
        btc_end,
        winner,
        total_pool: total,
        winning_pool: winning_pool_amount,
        platform_fee,
        payout_ratio,
        settled_at,
    };

    // Update pool status
    betting::update_status_settled(pool);

    // Emit event
    event::emit(SettlementCreated {
        settlement_id,
        pool_id: object::id(pool),
        round_id: betting::round_id(pool),
        winner,
        payout_ratio,
        settled_at,
    });

    transfer::share_object(settlement);
    settlement_id
}

/// Distribute payout
public fun distribute_payout(
    _: &AdminCap,
    pool: &mut BettingPool,
    settlement: &Settlement,
    bet: Bet,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<DEL_COIN> {
    assert!(object::id(pool) == settlement.pool_id, E_ROUND_MISMATCH);
    assert!(betting::bet_pool_id(&bet) == settlement.pool_id, E_ROUND_MISMATCH);

    let prediction = betting::bet_prediction(&bet);
    let amount = betting::bet_amount(&bet);
    let user = betting::bet_user(&bet);
    let bet_id = object::id(&bet);

    // Check if winner
    if (settlement.winner == WINNER_DRAW) {
        // Refund logic should be separate or handled here?
        // Let's handle refund in refund_bet
        abort E_NOT_WINNER
    };

    let is_winner =
        (settlement.winner == WINNER_GOLD && prediction == 1) ||
                        (settlement.winner == WINNER_BTC && prediction == 2);

    assert!(is_winner, E_NOT_WINNER);

    // Calculate payout
    // Payout = Amount * Ratio / Scale
    let payout_amount = amount * settlement.payout_ratio / RATIO_SCALE;

    // Take from pool
    let balance = betting::take_payout(pool, payout_amount);

    let coin = coin::from_balance(balance, ctx);

    event::emit(PayoutDistributed {
        settlement_id: object::id(settlement),
        bet_id,
        user,
        amount: payout_amount,
        timestamp: clock.timestamp_ms(),
    });

    betting::burn_bet(bet);
    coin
}

/// Refund bet (in case of DRAW)
public fun refund_bet(
    _: &AdminCap,
    pool: &mut BettingPool,
    settlement: &Settlement,
    bet: Bet,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<DEL_COIN> {
    assert!(object::id(pool) == settlement.pool_id, E_ROUND_MISMATCH);
    assert!(betting::bet_pool_id(&bet) == settlement.pool_id, E_ROUND_MISMATCH);
    assert!(settlement.winner == WINNER_DRAW, E_NOT_WINNER);

    let amount = betting::bet_amount(&bet);
    let user = betting::bet_user(&bet);
    let bet_id = object::id(&bet);

    // Take refund from pool
    let balance = betting::take_payout(pool, amount);
    let coin = coin::from_balance(balance, ctx);

    event::emit(RefundProcessed {
        pool_id: object::id(pool),
        bet_id,
        user,
        amount,
        timestamp: clock.timestamp_ms(),
    });

    betting::burn_bet(bet);
    coin
}
