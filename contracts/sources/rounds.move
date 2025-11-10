module deltaX::rounds {
    use sui::clock;
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};

    struct Round has key, store {
        id: UID,
        timeframe: u64,
        locked: bool,
    }

    public fun init(ctx: &mut TxContext) {
        // 프로젝트 초기화 시 1회 호출되는 모듈 등록 자리
    }

    public fun create_round(timeframe: u64, ctx: &mut TxContext): Round {
        let uid = object::new(ctx);
        Round { id: uid, timeframe, locked: false }
    }

    public fun lock_round(round: &mut Round) {
        round.locked = true;
    }
}
