#[test_only]
module deltax::betting_tests;

use deltax::betting::{Self, AdminCap, BettingPool, Bet};
use deltax::del_coin::{Self, DEL_COIN};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::test_scenario;

#[test]
fun test_create_pool_and_bet() {
    let admin = @0xAD;
    let user = @0xCAFE;

    let mut scenario = test_scenario::begin(admin);
    let mut clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut clock, 1000);

    // 1. Init
    {
        let ctx = test_scenario::ctx(&mut scenario);
        betting::init_for_testing(ctx);
        del_coin::init_for_testing(ctx);
    };

    // 2. Create Pool
    test_scenario::next_tx(&mut scenario, admin);
    {
        let admin_cap = test_scenario::take_from_sender<AdminCap>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        betting::create_pool(
            &admin_cap,
            1, // round_id
            100, // lock_time (seconds) -> 100000 ms
            200, // end_time
            ctx,
        );
        test_scenario::return_to_sender(&scenario, admin_cap);
    };

    // 3. Mint Coins
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<DEL_COIN>>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        del_coin::mint(&mut treasury_cap, 1000_000_000_000, user, ctx); // 1000 DEL
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };

    // 4. Place Bet
    test_scenario::next_tx(&mut scenario, user);
    {
        let mut pool = test_scenario::take_shared<BettingPool>(&scenario);
        let mut coin = test_scenario::take_from_sender<Coin<DEL_COIN>>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        betting::place_bet(
            &mut pool,
            user,
            1, // GOLD
            coin,
            &clock,
            ctx,
        );

        test_scenario::return_shared(pool);
    };

    // 5. Verify Bet Created
    test_scenario::next_tx(&mut scenario, user);
    {
        let bet = test_scenario::take_from_sender<Bet>(&scenario);
        assert!(betting::bet_amount(&bet) == 1000_000_000_000, 0);
        assert!(betting::bet_prediction(&bet) == 1, 1);
        test_scenario::return_to_sender(&scenario, bet);
    };

    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}
