/// DEL Token - deltaX 베팅 플랫폼의 자체 토큰
///
/// 역할:
/// - 베팅 시 DEL을 Pool에 Lock
/// - 승리 시 DEL로 배당 수령
/// - Admin만 발행 가능 (TreasuryCap 소유자)
module deltax::del;

use sui::coin::{Self, TreasuryCap, Coin};
use sui::url;

// ============ Constants ============
/// 소수점 자릿수: 1 DEL = 10^9 units
const DECIMALS: u8 = 9;

// ============ OTW (One-Time Witness) ============
/// 모듈 이름과 동일해야 함! (대문자)
/// 패키지 배포 시 딱 1번만 생성됨
/// 이걸로 "이 코인은 deltax::del_coin이 만든 진짜"임을 증명
public struct DEL has drop {}

// ============ Init ============
/// 패키지 배포 시 자동 호출됨
///
/// 하는 일:
/// 1. coin::create_currency로 DEL 토큰 타입 등록
/// 2. TreasuryCap을 배포자(Admin)에게 전송 → 발행 권한
/// 3. CoinMetadata를 공개 → 토큰 정보 누구나 조회 가능
#[allow(lint(self_transfer))]
fun init(witness: DEL, ctx: &mut TxContext) {
    // create_currency 반환값:
    // - TreasuryCap: mint/burn 권한 (Admin이 소유)
    // - CoinMetadata: 토큰 메타데이터 (공개)
    let (treasury_cap, metadata) = coin::create_currency<DEL>(
        witness, // OTW 증명
        DECIMALS, // 소수점 9자리
        b"DEL", // 심볼
        b"DeltaX Token", // 이름
        b"Betting token for deltaX platform", // 설명
        option::some(
            url::new_unsafe_from_bytes(
                // 아이콘 URL (선택)
                b"https://deltax.example.com/del-icon.png",
            ),
        ),
        ctx,
    );

    // 발행 권한을 배포자에게 전송
    // 이후 Admin이 mint 호출 시 이 객체 필요
    transfer::public_transfer(treasury_cap, ctx.sender());

    // 메타데이터는 freeze해서 누구나 조회 가능하게
    transfer::public_freeze_object(metadata);
}

// ============ Public Functions ============

/// DEL 발행 (Admin 전용)
///
/// # Arguments
/// - treasury: TreasuryCap 참조 (발행 권한 증명)
/// - amount: 발행량 (10^9 단위. 1 DEL = 1_000_000_000)
/// - recipient: 받을 주소
///
/// # Example
/// 100 DEL 발행하려면: amount = 100_000_000_000
public fun mint(
    treasury: &mut TreasuryCap<DEL>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    // coin::mint로 새 Coin 객체 생성
    let coin = coin::mint(treasury, amount, ctx);
    // recipient에게 전송
    transfer::public_transfer(coin, recipient);
}

/// DEL 소각
///
/// # Arguments
/// - treasury: TreasuryCap 참조
/// - coin: 소각할 Coin 객체
public fun burn(treasury: &mut TreasuryCap<DEL>, coin: Coin<DEL>) {
    coin::burn(treasury, coin);
}

// ============ Test-only Functions ============
#[test_only]
/// 테스트용 init 호출 헬퍼
public fun test_init(ctx: &mut TxContext) {
    init(DEL {}, ctx);
}
