# DeltaX Move Contracts

DeltaX 6시간 주기 베팅 플랫폼의 Sui Move 스마트 컨트랙트입니다.

## 📁 구조

```
contracts/
├── Move.toml                   # 패키지 설정
├── sources/
│   ├── del_coin.move          # DEL 토큰 (발행/소각)
│   ├── betting.move           # 베팅 풀 및 베팅 로직
│   └── settlement.move        # 정산 및 배당 전송
└── tests/
    ├── del_coin_tests.move    # DEL 토큰 테스트
    ├── betting_tests.move     # 베팅 테스트
    └── settlement_tests.move  # 정산 테스트
```

## 🔧 요구 사항

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) >= 1.61.x
- Rust toolchain (Sui CLI가 내부적으로 사용)

```bash
# Sui CLI 설치 확인
sui --version
```

## 🚀 명령어

```bash
# 의존성 다운로드 및 빌드
sui move build

# 테스트 실행
sui move test

# 테스트 커버리지
sui move test --coverage

# 배포 (testnet)
sui client publish --gas-budget 200000000
```

## 📦 모듈 설명

### `del_coin` - DEL 토큰

- **목적**: 베팅에 사용되는 DEL 코인 관리
- **정책**: 무제한 발행 (프로토타입 단계)
- **주요 함수**:
  - `mint()`: DEL 발행 (Admin 전용)
  - `burn()`: DEL 소각

### `betting` - 베팅 로직

- **목적**: 라운드별 베팅 풀 관리
- **오브젝트**:
  - `BettingPool` (Shared): 라운드당 1개, 베팅 잔액 보관
  - `Bet` (Owned): 개별 베팅, 유저 소유
  - `AdminCap`: 관리자 권한
- **주요 함수**:
  - `create_pool()`: 풀 생성 (Cron Job 2)
  - `place_bet()`: 베팅 (Sponsored Tx로 호출)
  - `lock_pool()`: 베팅 마감 (Cron Job 3)

### `settlement` - 정산 로직

- **목적**: 라운드 종료 후 승자 결정 및 배당
- **오브젝트**:
  - `Settlement` (Shared): 정산 기록, 불변
- **주요 함수**:
  - `finalize_round()`: 정산 실행 (Cron Job 4)
  - `distribute_payout()`: 승자 배당 (Cron Job 5)
  - `refund_bet()`: DRAW 시 환불

## 🔐 보안 모델

- **Sponsored Transaction**: 모든 유저 트랜잭션은 Admin이 가스비 대납
- **Event 기반 추적**: Sponsored Tx에서도 실제 유저 주소를 Event로 기록
- **AdminCap 패턴**: 관리 함수는 AdminCap 소유자만 호출 가능

## 🔄 워크플로우

```
1. Round Open (Cron Job 2)
   └─ create_pool() → BettingPool 생성

2. Betting Period
   └─ place_bet() → Bet 오브젝트 생성, DEL 풀에 입금

3. Lock (Cron Job 3)
   └─ lock_pool() → 베팅 마감

4. Settlement (Cron Job 4)
   └─ finalize_round() → 승자 결정, Settlement 생성

5. Payout (Cron Job 5)
   └─ distribute_payout() / refund_bet() → 배당/환불
```

## 📋 배포 후 설정

배포 후 출력되는 Object ID들을 `.env.local`에 저장:

```bash
SUI_NETWORK=testnet
SUI_PACKAGE_ID=0x...
SUI_ADMIN_CAP_ID=0x...
SUI_TREASURY_CAP_ID=0x...
SUI_ADMIN_SECRET_KEY=<base64 encoded>
```

## 🧪 테스트 시나리오

- ✅ DEL 발행/소각
- ✅ Pool 생성/잠금
- ✅ 베팅 (GOLD/BTC)
- ✅ 시간 제한 검증 (lock_time 이후 베팅 불가)
- ✅ 최소 금액 검증
- ✅ 정산 (GOLD 승리 / BTC 승리 / DRAW)
- ✅ 배당 전송
- ✅ DRAW 환불
- ✅ 패자 배당 시도 실패

## 📚 참고 문서

- [SUI_CONTRACT_SPEC.md](../docs/ehdnd/sui/SUI_CONTRACT_SPEC.md) - 상세 기술 명세
- [SUI_INTEGRATION.md](../docs/ehdnd/SUI_INTEGRATION.md) - Next.js 통합 가이드
