#[test_only]
module deltax::del_tests;

use deltax::del::{Self, DEL};
use sui::coin::{Self, TreasuryCap};
use sui::test_scenario;

/// 기본 mint 테스트
#[test]
fun test_mint() {
    let admin = @0xAD;
    let user = @0xCAFE;

    let mut scenario = test_scenario::begin(admin);

    // 1. Init 호출 (test_init 헬퍼 사용)
    {
        del::test_init(test_scenario::ctx(&mut scenario));
    };

    // 2. Admin이 TreasuryCap을 받았는지 확인 후 mint
    test_scenario::next_tx(&mut scenario, admin);
    {
        // TreasuryCap이 admin에게 전송되었는지 확인
        assert!(test_scenario::has_most_recent_for_sender<TreasuryCap<DEL>>(&scenario), 0);

        let mut treasury = test_scenario::take_from_sender<TreasuryCap<DEL>>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        // 100 DEL = 100 * 10^9
        del::mint(&mut treasury, 100_000_000_000, user, ctx);

        test_scenario::return_to_sender(&scenario, treasury);
    };

    // 3. User가 DEL을 받았는지 확인
    test_scenario::next_tx(&mut scenario, user);
    {
        let coin = test_scenario::take_from_sender<sui::coin::Coin<DEL>>(&scenario);
        assert!(coin::value(&coin) == 100_000_000_000, 1);
        test_scenario::return_to_sender(&scenario, coin);
    };

    test_scenario::end(scenario);
}

/// burn 테스트
#[test]
fun test_burn() {
    let admin = @0xAD;

    let mut scenario = test_scenario::begin(admin);

    // 1. Init
    {
        del::test_init(test_scenario::ctx(&mut scenario));
    };

    // 2. Admin에게 mint
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury = test_scenario::take_from_sender<TreasuryCap<DEL>>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        // Admin 자신에게 100 DEL 발행
        del::mint(&mut treasury, 100_000_000_000, admin, ctx);

        test_scenario::return_to_sender(&scenario, treasury);
    };

    // 3. Admin이 자신의 DEL을 소각
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury = test_scenario::take_from_sender<TreasuryCap<DEL>>(&scenario);
        let coin = test_scenario::take_from_sender<sui::coin::Coin<DEL>>(&scenario);

        // 소각 전 supply 확인
        let supply_before = coin::total_supply(&treasury);
        assert!(supply_before == 100_000_000_000, 2);

        del::burn(&mut treasury, coin);

        // 소각 후 supply 확인
        let supply_after = coin::total_supply(&treasury);
        assert!(supply_after == 0, 3);

        test_scenario::return_to_sender(&scenario, treasury);
    };

    test_scenario::end(scenario);
}
