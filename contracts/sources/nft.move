module deltaX::nft {
    use std::string::{String, utf8};
    use sui::package;
    use sui::display;

    /// NFT Struct
    public struct DeltaxNFT has key, store {
        id: UID,
        name: String,
        description: String,
        url: String,
        tier: String,
    }

    /// One-Time-Witness
    public struct NFT has drop {}

    fun init(otw: NFT, ctx: &mut TxContext) {
        let keys = vector[
            utf8(b"name"),
            utf8(b"image_url"),
            utf8(b"description"),
            utf8(b"tier"),
        ];

        let values = vector[
            utf8(b"{name}"),
            utf8(b"{url}"),
            utf8(b"{description}"),
            utf8(b"{tier}"),
        ];

        let publisher = package::claim(otw, ctx);
        let mut display = display::new_with_fields<DeltaxNFT>(
            &publisher, keys, values, ctx
        );

        display::update_version(&mut display);

        transfer::public_transfer(publisher, tx_context::sender(ctx));
        transfer::public_transfer(display, tx_context::sender(ctx));
    }

    /// Mint NFT
    public entry fun mint_nft(
        name: String,
        description: String,
        url: String,
        tier: String,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let nft = DeltaxNFT {
            id: object::new(ctx),
            name,
            description,
            url,
            tier,
        };

        transfer::public_transfer(nft, recipient);
    }
}
