# Sui CLI 명령어 치트시트

자주 쓰는 Sui CLI 명령어 모음

---

## 🔧 초기 설정

```bash
# Sui 버전 확인
sui --version

# 도움말
sui --help
sui client --help
```

---

## 👛 지갑 관리

### 주소 확인

```bash
# 현재 활성 주소
sui client active-address

# 모든 지갑 목록
sui keytool list

# 특정 지갑 상세 정보
sui keytool show <alias>
```

### 지갑 생성/가져오기

```bash
# 새 지갑 생성
sui client new-address ed25519

# 지갑 import (비밀키로)
sui keytool import <비밀키> ed25519

# 비밀키 export
sui keytool export --key-identity <alias>
```

### 지갑 전환

```bash
# 다른 지갑으로 전환
sui client switch --address <주소>
```

---

## 🌐 네트워크 관리

```bash
# 현재 네트워크 확인
sui client active-env

# 사용 가능한 네트워크 목록
sui client envs

# 네트워크 전환
sui client switch --env testnet
sui client switch --env mainnet
sui client switch --env devnet

# 새 네트워크 추가
sui client new-env --alias <이름> --rpc <URL>
```

---

## 💰 잔액 & Object

### SUI 잔액

```bash
# SUI 잔액 확인
sui client gas

# 테스트넷에서 무료 SUI 받기
sui client faucet
```

### Object 조회

```bash
# 내가 가진 모든 Object
sui client objects

# 특정 Object 상세
sui client object <object_id>

# Object 상세 (JSON)
sui client object <object_id> --json
```

---

## 📦 컨트랙트 개발

### 빌드 & 테스트

```bash
# 빌드
sui move build

# 테스트
sui move test

# 테스트 (상세)
sui move test --verbose

# 특정 테스트만
sui move test <test_name>

# 커버리지
sui move test --coverage
```

### 배포

```bash
# Testnet 배포
sui client publish --gas-budget 200000000

# 배포 (JSON 출력)
sui client publish --gas-budget 200000000 --json
```

---

## 📝 트랜잭션

### 조회

```bash
# 특정 트랜잭션 조회
sui client tx <digest>

# 최근 트랜잭션
sui client txs
```

### 실행

```bash
# Move 함수 호출 (예: DEL 발행)
sui client call \
  --package <package_id> \
  --module del \
  --function mint \
  --args <treasury_cap_id> 1000000000000 <recipient_address> \
  --gas-budget 10000000
```

---

## 🔍 정보 조회

```bash
# 체인 정보
sui client chain-id

# 현재 상태
sui client status

# 특정 패키지 정보
sui client object <package_id>
```

---

## 💸 전송

```bash
# SUI 전송
sui client transfer-sui \
  --to <받는_주소> \
  --sui-coin-object-id <coin_object_id> \
  --amount 1000000000 \
  --gas-budget 10000000

# Object 전송
sui client transfer \
  --to <받는_주소> \
  --object-id <object_id> \
  --gas-budget 10000000
```

---

## 🛠️ 유틸리티

```bash
# 주소 포맷 변환
sui client --help | grep address

# Base64 인코딩
echo -n "hello" | base64

# 현재 epoch
sui client epoch
```

---

## 📋 자주 쓰는 조합

### 배포 후 정보 확인

```bash
# 1. 배포
sui client publish --gas-budget 200000000

# 2. 내 Object 확인 (AdminCap, TreasuryCap 찾기)
sui client objects

# 3. 특정 Object 상세
sui client object <object_id>
```

### 지갑 공유용 정보 추출

```bash
# 주소
sui client active-address

# 비밀키
sui keytool export --key-identity main

# 보유 Object
sui client objects
```

### 문제 해결

```bash
# SUI 부족
sui client faucet
sui client gas

# 네트워크 확인
sui client active-env

# Object 확인
sui client objects
```

---

## 🔗 Explorer 링크 생성

```bash
# Package 보기
echo "https://suiscan.xyz/testnet/object/<package_id>"

# 지갑 보기
echo "https://suiscan.xyz/testnet/account/<address>"

# 트랜잭션 보기
echo "https://suiscan.xyz/testnet/tx/<digest>"
```

---

## ⚠️ 주의사항

1. **--gas-budget**: 항상 충분히 설정 (200000000 권장)
2. **네트워크 확인**: 작업 전 `sui client active-env`로 확인
3. **비밀키 보안**: `export` 결과 절대 공유 금지
4. **testnet vs mainnet**: 실수로 mainnet에서 작업하지 않게 주의
