module deltax::del_coin;

use sui::coin::{Self, Coin, TreasuryCap};

/// One-Time Witness (OTW) for the coin
public struct DEL_COIN has drop {}

/// Constants
const DECIMALS: u8 = 9;

/// Initialize the coin
fun init(witness: DEL_COIN, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        DECIMALS,
        b"DEL",
        b"DeltaX Coin",
        b"Native currency for DeltaX betting platform",
        option::none(),
        ctx,
    );

    // Transfer the treasury cap to the deployer (Admin)
    transfer::public_transfer(treasury, tx_context::sender(ctx));

    // Freeze the metadata as it won't change
    transfer::public_freeze_object(metadata);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    let witness = DEL_COIN {};
    init(witness, ctx);
}

/// Mint new coins (Admin only)
public fun mint(
    treasury: &mut TreasuryCap<DEL_COIN>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin = coin::mint(treasury, amount, ctx);
    transfer::public_transfer(coin, recipient);
}

/// Burn coins
public fun burn(treasury: &mut TreasuryCap<DEL_COIN>, coin: Coin<DEL_COIN>) {
    coin::burn(treasury, coin);
}
