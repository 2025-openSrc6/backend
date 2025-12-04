# Sui 컨트랙트 배포 & 운영 가이드

## 📋 목차

1. [기본 개념](#1-기본-개념)
2. [환경 설정](#2-환경-설정)
3. [Testnet 배포](#3-testnet-배포)
4. [배포 결과물 이해](#4-배포-결과물-이해)
5. [팀 협업 가이드](#5-팀-협업-가이드)
6. [컨트랙트 업데이트](#6-컨트랙트-업데이트)
7. [유용한 명령어](#7-유용한-명령어)
8. [트러블슈팅](#8-트러블슈팅)

---

## 1. 기본 개념

### 1.1 네트워크 종류

| 네트워크     | 용도             | 비용 | 특징                 |
| ------------ | ---------------- | ---- | -------------------- |
| **localnet** | 로컬 개발        | 무료 | 내 컴퓨터에서만 실행 |
| **devnet**   | 개발 테스트      | 무료 | 자주 리셋됨          |
| **testnet**  | 통합 테스트/데모 | 무료 | 안정적, 우리가 사용  |
| **mainnet**  | 실제 서비스      | 유료 | 진짜 돈 필요         |

### 1.2 지갑 개념

```
┌─────────────────────────────────────────┐
│  Sui 지갑                                │
│                                         │
│  주소 (Address): 0xABC...               │  ← 공개 (계좌번호)
│  비밀키 (Secret Key): suiprivkey1...    │  ← 비밀 (비밀번호)
│                                         │
│  보유 자산:                              │
│   - SUI (가스비용)                       │
│   - AdminCap, TreasuryCap (권한 객체)   │
│   - 기타 Object들                       │
└─────────────────────────────────────────┘
```

**중요:** 비밀키를 가진 사람이 지갑의 주인!

### 1.3 Object 개념

Sui에서 모든 것은 Object(객체)야:

| Object 종류     | 설명                 | 소유 형태             |
| --------------- | -------------------- | --------------------- |
| **Package**     | 배포된 컨트랙트 코드 | Immutable (변경 불가) |
| **AdminCap**    | 관리자 권한 증명     | Owned (개인 소유)     |
| **TreasuryCap** | 토큰 발행 권한       | Owned (개인 소유)     |
| **BettingPool** | 베팅 풀              | Shared (공유)         |
| **Bet**         | 개별 베팅            | Owned (유저 소유)     |

### 1.4 Gas (가스비)

블록체인 사용료. 모든 트랜잭션에 SUI 필요.

```bash
# gas-budget: "최대 이만큼 쓸게"
sui client publish --gas-budget 200000000  # 0.2 SUI까지 허용
# 실제로는 보통 0.04 SUI 정도만 사용됨
```

---

## 2. 환경 설정

### 2.1 Sui CLI 설치

```bash
# macOS (Homebrew)
brew install sui

# 버전 확인
sui --version
```

### 2.2 지갑 생성 (처음 사용 시)

```bash
# 새 지갑 생성
sui client new-address ed25519

# 또는 기존 지갑 import
sui keytool import <비밀키> ed25519
```

### 2.3 네트워크 설정

```bash
# 현재 네트워크 확인
sui client active-env

# testnet으로 변경
sui client switch --env testnet

# 사용 가능한 환경 목록
sui client envs
```

### 2.4 테스트 SUI 받기

```bash
# Testnet에서 무료 SUI 받기
sui client faucet

# 잔액 확인
sui client gas
```

---

## 3. Testnet 배포

### 3.1 사전 체크리스트

```bash
# 1. 네트워크 확인
sui client active-env  # testnet이어야 함

# 2. 지갑 주소 확인
sui client active-address

# 3. SUI 잔액 확인 (최소 0.5 SUI 권장)
sui client gas

# 4. 컨트랙트 빌드 테스트
cd contracts
sui move build

# 5. 테스트 실행
sui move test
```

### 3.2 배포 실행

```bash
cd contracts
sui client publish --gas-budget 200000000
```

### 3.3 배포 결과 확인

배포 성공 시 출력에서 중요한 정보 찾기:

```
Published Objects:
  PackageID: 0x29cea6aa...  ← Package ID

Created Objects:
  ObjectType: ...::betting::AdminCap
  ObjectID: 0xf1936d88...   ← AdminCap ID

  ObjectType: ...::coin::TreasuryCap<...::del::DEL>
  ObjectID: 0xb04a254d...   ← TreasuryCap ID
```

### 3.4 환경변수 저장

`.env.local`에 추가 (실제 값은 팀 내부 공유):

```bash
# Sui Testnet Configuration
SUI_NETWORK=testnet
SUI_PACKAGE_ID=<배포 후 얻은 Package ID>
SUI_ADMIN_CAP_ID=<배포 후 얻은 AdminCap ID>
SUI_TREASURY_CAP_ID=<배포 후 얻은 TreasuryCap ID>
SUI_ADMIN_SECRET_KEY=<sui keytool export로 얻은 비밀키 - 절대 공개 금지!>
```

---

## 4. 배포 결과물 이해

### 4.1 생성되는 Object들

```
sui client publish 실행
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                   Sui Testnet                          │
│                                                       │
│  1. Package 생성 (코드 저장)                           │
│     → Package ID: 0x29ce...                           │
│     → 변경 불가! (Immutable)                          │
│                                                       │
│  2. del.move의 init() 자동 실행                       │
│     → TreasuryCap 생성 → 배포자 지갑으로 전송         │
│                                                       │
│  3. betting.move의 init() 자동 실행                   │
│     → AdminCap 생성 → 배포자 지갑으로 전송            │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 4.2 각 Object의 역할

| Object          | 용도                            | 누가 사용?        |
| --------------- | ------------------------------- | ----------------- |
| **Package ID**  | 컨트랙트 함수 호출 시 위치 지정 | Next.js 서버      |
| **AdminCap**    | Pool 생성, 잠금, 정산 권한 증명 | Cron Job (Admin)  |
| **TreasuryCap** | DEL 토큰 발행 권한              | Admin (테스트 시) |

### 4.3 Sui Explorer에서 확인

- **컨트랙트:** https://suiscan.xyz/testnet/object/{PACKAGE_ID}
- **지갑:** https://suiscan.xyz/testnet/account/{ADDRESS}
- **트랜잭션:** https://suiscan.xyz/testnet/tx/{TX_DIGEST}

---

## 5. 팀 협업 가이드

### 5.1 공유해도 되는 것 vs 안 되는 것

```
┌─────────────────────────────────────────────────────────────┐
│                    공유 가이드                               │
├───────────────────┬─────────────────────────────────────────┤
│  ✅ 공유 OK       │  ❌ 절대 공유 금지                       │
│  ────────────     │  ─────────────────                       │
│  • Package ID     │  • 비밀키 (Secret Key)                  │
│  • AdminCap ID    │    → suiprivkey1...                     │
│  • TreasuryCap ID │    → SUI_ADMIN_SECRET_KEY               │
│  • 지갑 주소      │                                         │
│  • Transaction ID │                                         │
│  • Explorer 링크  │                                         │
└───────────────────┴─────────────────────────────────────────┘
```

### 5.2 팀원에게 지갑 공유하기

**Step 1: 비밀키 추출**

```bash
sui keytool export --key-identity main
# 출력: suiprivkey1... (이 값을 팀원에게 DM으로 전달)
```

**Step 2: 팀원에게 전달 (DM으로!)**

```
# DeltaX Sui Testnet 배포 정보

## 공개 정보
- Network: testnet
- Package ID: <배포된 Package ID>
- AdminCap ID: <AdminCap Object ID>
- TreasuryCap ID: <TreasuryCap Object ID>
- Admin 주소: <Admin 지갑 주소>

## 비밀 정보 (팀 내부만! 절대 GitHub/공개채널 금지!)
- Admin 비밀키: <sui keytool export 결과값>
```

**Step 3: 팀원이 지갑 import**

```bash
# CLI에서
sui keytool import <받은_비밀키> ed25519

# 활성화
sui client switch --address <Admin_주소>
```

### 5.3 브라우저 지갑 (Slush)에서 확인

1. Slush 설치: https://slush.app
2. 설정 → Network → **Testnet** 선택
3. Import Wallet → Private Key 입력
4. **"Assets" 탭**에서 AdminCap, TreasuryCap 확인

> **주의:** "Coins" 탭에는 SUI만 보임. Object들은 "Assets" 탭에서!

---

## 6. 컨트랙트 업데이트

### 6.1 핵심 사실

```
❌ 배포된 코드는 수정 불가능!
```

블록체인의 Immutability(불변성) 특성.

### 6.2 업데이트 절차

```
1. 코드 수정
   contracts/sources/betting.move 등
        │
        ▼
2. 테스트
   sui move test
        │
        ▼
3. 새로 배포
   sui client publish --gas-budget 200000000
        │
        ▼
4. 새 ID들 획득
   - 새 Package ID
   - 새 AdminCap ID  (init이 다시 실행됨)
   - 새 TreasuryCap ID
        │
        ▼
5. .env.local 업데이트
   모든 ID 교체
        │
        ▼
6. 팀원들에게 새 정보 공유
```

### 6.3 주의사항

- 기존 Pool, Bet 데이터는 **이전 버전에 묶여있음**
- 마이그레이션 불가능 → 새로 시작해야 함
- 그래서 Testnet에서 충분히 테스트 후 Mainnet!

### 6.4 버전 관리 팁

```bash
# 배포할 때마다 기록 남기기
echo "v1.0.0 - $(date)" >> contracts/DEPLOY_HISTORY.md
echo "Package ID: 0x..." >> contracts/DEPLOY_HISTORY.md
echo "" >> contracts/DEPLOY_HISTORY.md
```

---

## 7. 유용한 명령어

### 7.1 지갑 관련

```bash
# 현재 지갑 주소
sui client active-address

# 모든 지갑 목록
sui keytool list

# 지갑 전환
sui client switch --address <주소>

# 새 지갑 생성
sui client new-address ed25519

# 지갑 import
sui keytool import <비밀키> ed25519

# 비밀키 추출
sui keytool export --key-identity <alias>
```

### 7.2 잔액 & Object

```bash
# SUI 잔액
sui client gas

# 보유 Object 목록
sui client objects

# 특정 Object 상세
sui client object <object_id>
```

### 7.3 네트워크

```bash
# 현재 네트워크
sui client active-env

# 네트워크 전환
sui client switch --env testnet

# 테스트 SUI 받기
sui client faucet
```

### 7.4 컨트랙트

```bash
# 빌드
sui move build

# 테스트
sui move test

# 테스트 (상세 출력)
sui move test --verbose

# 배포
sui client publish --gas-budget 200000000
```

### 7.5 트랜잭션 조회

```bash
# 특정 트랜잭션 상세
sui client tx <digest>
```

---

## 8. 트러블슈팅

### 8.1 "Insufficient gas" 에러

```bash
# SUI 부족. 테스트 SUI 받기
sui client faucet
sui client gas  # 잔액 확인
```

### 8.2 "Object not found" 에러

- Object ID 오타 확인
- 네트워크 확인 (testnet vs mainnet)
- Object가 삭제/소각되었을 수 있음

### 8.3 "Unable to find module" 에러

```bash
# 빌드 먼저
sui move build

# 의존성 문제 시 clean build
rm -rf build/
sui move build
```

### 8.4 배포 후 AdminCap이 안 보임

```bash
# CLI에서 확인 (브라우저 지갑 말고)
sui client objects

# 또는 Explorer에서 지갑 주소로 검색
```

### 8.5 Slush에서 Object 안 보임

1. Network가 **Testnet**인지 확인
2. **"Assets" 탭** 확인 (Coins 탭 아님!)
3. 페이지 새로고침

---

## 📌 현재 배포 정보

> ⚠️ **실제 배포 정보는 `.env.local` 또는 팀 내부 문서 참조**
>
> GitHub에 올리면 안 되는 정보:
>
> - 비밀키 (SUI_ADMIN_SECRET_KEY)
>
> 공개해도 되는 정보:
>
> - Package ID, AdminCap ID, TreasuryCap ID, 지갑 주소

```
Network: testnet
Package ID: sui client objects 또는 배포 로그에서 확인
AdminCap ID: sui client objects에서 betting::AdminCap 찾기
TreasuryCap ID: sui client objects에서 coin::TreasuryCap 찾기
Admin 주소: sui client active-address

Explorer:
- Package: https://suiscan.xyz/testnet/object/<PACKAGE_ID>
- Admin Wallet: https://suiscan.xyz/testnet/account/<ADMIN_ADDRESS>
```

---

## 변경 이력

| 날짜       | 버전   | 변경 내용         |
| ---------- | ------ | ----------------- |
| 2025-12-04 | v1.0.0 | 초기 Testnet 배포 |
