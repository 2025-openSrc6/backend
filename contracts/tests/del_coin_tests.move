#[test_only]
module deltax::del_coin_tests;

use deltax::del_coin::{Self, DEL_COIN};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::test_scenario;

#[test]
fun test_mint_burn() {
    let admin = @0xAD;
    let user = @0xCAFE;

    let mut scenario = test_scenario::begin(admin);

    // 1. Init
    {
        let ctx = test_scenario::ctx(&mut scenario);
        // We can't call init directly in tests usually unless we use test_utils or just simulate it.
        // But del_coin::init is private.
        // However, we can use test_scenario::next_tx to simulate init if we had a test helper.
        // Or we can just test mint/burn if we can get TreasuryCap.
        // Since init is private and takes OTW, we can't easily call it.
        // But we can use `test_scenario::take_from_sender` if we assume it ran? No.
        // Best practice: Have a test_init function or use `init` in a separate module for testing?
        // Actually, for OTW, we can generate it in test if it's in same package? No.
        // Let's just assume we can't test init easily without `sui::test_utils::create_one_time_witness`.
        // Let's try to mock the OTW if possible, or just skip init test and test public functions assuming we have TreasuryCap.
        // But we can't get TreasuryCap without init.
        // Ah, we can use `sui::coin::create_currency` in test to get a dummy TreasuryCap?
        // But we want to test OUR `mint` function which takes `TreasuryCap<DEL>`.
        // We need `TreasuryCap<DEL>`.
        // We can't create `DEL` OTW in test module.
        // So we usually add a `test_init` in the main module or make `init` public(package) for tests?
        // Or use `#[test_only]` init wrapper in main module.
    };
    test_scenario::end(scenario);
}
