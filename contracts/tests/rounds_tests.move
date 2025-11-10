#[test_only]
module deltaX::rounds_tests {
    use sui::test_scenario;
    use deltaX::rounds;

    #[test]
    fun creates_round() {
        let scenario = test_scenario::create();
        let ctx = test_scenario::ctx(&scenario);
        let round = rounds::create_round(60, ctx);
        assert!(!round.locked, 0);
        test_scenario::destroy(ctx);
    }
}
