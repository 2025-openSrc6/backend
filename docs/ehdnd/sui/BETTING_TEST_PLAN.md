# Betting Module 테스트 계획서

> **문서 버전**: 1.0.0  
> **작성일**: 2025-12-04  
> **대상 모듈**: `deltax::betting`

---

## 📋 목차

1. [개요](#1-개요)
2. [함수 목록](#2-함수-목록)
3. [테스트 케이스 상세](#3-테스트-케이스-상세)
4. [테스트 헬퍼 함수](#4-테스트-헬퍼-함수)
5. [테스트 실행 방법](#5-테스트-실행-방법)

---

## 1. 개요

### 1.1 테스트 목적

`betting.move` 모듈의 모든 public 함수에 대해:
- **정상 동작** 검증 (Happy Path)
- **에러 케이스** 검증 (Edge Cases & Error Handling)
- **상태 전이** 검증 (FSM: OPEN → LOCKED → SETTLED)
- **이벤트 발생** 검증 (Event Emission)

### 1.2 테스트 환경

```toml
# Move.toml 테스트 의존성
[dev-dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "testnet" }
```

### 1.3 주요 상수

| 상수명 | 값 | 설명 |
|--------|-----|------|
| `STATUS_OPEN` | 1 | 베팅 가능 상태 |
| `STATUS_LOCKED` | 2 | 베팅 마감 상태 |
| `STATUS_SETTLED` | 3 | 정산 완료 상태 |
| `PREDICTION_GOLD` | 1 | 금 예측 |
| `PREDICTION_BTC` | 2 | BTC 예측 |
| `MIN_BET_AMOUNT` | 100,000,000,000 | 최소 베팅액 (100 DEL) |
| `PLATFORM_FEE_RATE` | 5 | 플랫폼 수수료 (5%) |
| `RATIO_SCALE` | 100 | 배당률 스케일 |

---

## 2. 함수 목록

### 2.1 Admin 함수 (AdminCap 필요)

| 함수명 | 역할 | 호출 시점 |
|--------|------|----------|
| `create_pool` | 베팅 풀 생성 | 라운드 시작 시 (Cron Job 2) |
| `lock_pool` | 베팅 마감 | 라운드 종료 5분 전 (Cron Job 3) |
| `finalize_round` | 라운드 정산 | 라운드 종료 후 (Cron Job 4) |
| `distribute_payout` | 배당금 전송 | 정산 후 각 Bet 처리 (Cron Job 5) |

### 2.2 Public 함수

| 함수명 | 역할 | 호출 시점 |
|--------|------|----------|
| `place_bet` | 베팅 생성 | 유저 베팅 시 |

### 2.3 Init 함수

| 함수명 | 역할 | 호출 시점 |
|--------|------|----------|
| `init` | AdminCap 생성 | 패키지 배포 시 (자동) |

---

## 3. 테스트 케이스 상세

### 3.1 `init` 함수

#### TC-INIT-001: AdminCap 생성 및 전송 확인

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-INIT-001 |
| **테스트 명** | `test_init_creates_admin_cap` |
| **목적** | 패키지 배포 시 AdminCap이 배포자에게 전송되는지 확인 |
| **사전 조건** | 없음 |
| **테스트 절차** | 1. 패키지 배포 (init 호출)<br>2. sender가 AdminCap을 보유하는지 확인 |
| **예상 결과** | AdminCap이 sender에게 전송됨 |
| **검증 항목** | `test_scenario::has_most_recent_for_sender<AdminCap>()` |

---

### 3.2 `create_pool` 함수

#### TC-POOL-001: Pool 생성 성공

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-POOL-001 |
| **테스트 명** | `test_create_pool_success` |
| **목적** | AdminCap으로 Pool 생성이 정상 동작하는지 확인 |
| **사전 조건** | Admin이 AdminCap 보유 |
| **테스트 절차** | 1. AdminCap으로 `create_pool` 호출<br>2. Pool ID 반환 확인<br>3. Pool이 Shared Object로 생성됐는지 확인 |
| **예상 결과** | Pool 생성 성공, ID 반환 |
| **검증 항목** | - Pool ID가 유효한 값<br>- Pool.status == STATUS_OPEN<br>- Pool.round_id 일치<br>- Pool.lock_time, end_time 일치 |

#### TC-POOL-002: Pool 초기 상태 검증

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-POOL-002 |
| **테스트 명** | `test_create_pool_initial_state` |
| **목적** | 생성된 Pool의 초기 상태가 올바른지 확인 |
| **검증 항목** | - `gold_balance == 0`<br>- `btc_balance == 0`<br>- `total_pool == 0`<br>- `gold_pool == 0`<br>- `btc_pool == 0`<br>- `bet_count == 0`<br>- `status == STATUS_OPEN (1)` |

---

### 3.3 `place_bet` 함수

#### TC-BET-001: GOLD 베팅 성공

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-001 |
| **테스트 명** | `test_place_bet_gold_success` |
| **목적** | GOLD 예측 베팅이 정상 동작하는지 확인 |
| **사전 조건** | - Pool이 OPEN 상태<br>- 유저가 충분한 DEL 보유<br>- 현재 시간 < lock_time |
| **테스트 절차** | 1. 100 DEL로 GOLD 베팅<br>2. Bet 객체 생성 확인<br>3. Pool 통계 업데이트 확인 |
| **예상 결과** | 베팅 성공, Bet 객체 유저에게 전송 |
| **검증 항목** | - Bet.user == 베팅 유저 주소<br>- Bet.prediction == PREDICTION_GOLD<br>- Bet.amount == 100 DEL<br>- Pool.gold_pool += 100 DEL<br>- Pool.total_pool += 100 DEL<br>- Pool.bet_count += 1 |

#### TC-BET-002: BTC 베팅 성공

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-002 |
| **테스트 명** | `test_place_bet_btc_success` |
| **목적** | BTC 예측 베팅이 정상 동작하는지 확인 |
| **검증 항목** | - Pool.btc_pool += 베팅액<br>- Pool.total_pool += 베팅액 |

#### TC-BET-003: 복수 베팅 통계 누적

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-003 |
| **테스트 명** | `test_place_multiple_bets` |
| **목적** | 여러 유저의 베팅이 Pool에 정확히 누적되는지 확인 |
| **테스트 절차** | 1. User1: 100 DEL GOLD 베팅<br>2. User2: 200 DEL BTC 베팅<br>3. User3: 150 DEL GOLD 베팅 |
| **검증 항목** | - Pool.gold_pool == 250 DEL<br>- Pool.btc_pool == 200 DEL<br>- Pool.total_pool == 450 DEL<br>- Pool.bet_count == 3 |

#### TC-BET-004: BetPlaced 이벤트 발생 확인

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-004 |
| **테스트 명** | `test_place_bet_emits_event` |
| **목적** | 베팅 시 BetPlaced 이벤트가 발생하는지 확인 |
| **검증 항목** | - event.bet_id 존재<br>- event.pool_id == Pool ID<br>- event.user == 베팅 유저<br>- event.prediction 일치<br>- event.amount 일치 |

#### TC-BET-005: Pool 미오픈 시 실패 (E_POOL_NOT_OPEN)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-005 |
| **테스트 명** | `test_place_bet_pool_not_open` |
| **목적** | LOCKED/SETTLED 상태에서 베팅 시 에러 발생 확인 |
| **사전 조건** | Pool.status == STATUS_LOCKED |
| **예상 결과** | `E_POOL_NOT_OPEN (1)` 에러로 abort |
| **테스트 방식** | `#[expected_failure(abort_code = E_POOL_NOT_OPEN)]` |

#### TC-BET-006: 베팅 마감 시간 초과 (E_TOO_LATE)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-006 |
| **테스트 명** | `test_place_bet_too_late` |
| **목적** | lock_time 이후 베팅 시 에러 발생 확인 |
| **사전 조건** | clock.timestamp_ms >= pool.lock_time |
| **예상 결과** | `E_TOO_LATE (6)` 에러로 abort |

#### TC-BET-007: 잘못된 예측값 (E_INVALID_PREDICTION)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-007 |
| **테스트 명** | `test_place_bet_invalid_prediction` |
| **목적** | prediction이 1, 2가 아닌 경우 에러 발생 확인 |
| **사전 조건** | prediction == 0 또는 3 이상 |
| **예상 결과** | `E_INVALID_PREDICTION (3)` 에러로 abort |

#### TC-BET-008: 최소 베팅액 미만 (E_INSUFFICIENT_AMOUNT)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-008 |
| **테스트 명** | `test_place_bet_insufficient_amount` |
| **목적** | 100 DEL 미만 베팅 시 에러 발생 확인 |
| **사전 조건** | payment.value < 100_000_000_000 |
| **예상 결과** | `E_INSUFFICIENT_AMOUNT (4)` 에러로 abort |

#### TC-BET-009: 정확히 최소 베팅액 경계값 테스트

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-009 |
| **테스트 명** | `test_place_bet_exact_min_amount` |
| **목적** | 정확히 100 DEL 베팅 시 성공 확인 |
| **사전 조건** | payment.value == 100_000_000_000 |
| **예상 결과** | 베팅 성공 |

#### TC-BET-010: 최소 베팅액 1 unit 미만 경계값

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-BET-010 |
| **테스트 명** | `test_place_bet_one_below_min` |
| **목적** | 99.999999999 DEL 베팅 시 실패 확인 |
| **사전 조건** | payment.value == 99_999_999_999 |
| **예상 결과** | `E_INSUFFICIENT_AMOUNT` 에러 |

---

### 3.4 `lock_pool` 함수

#### TC-LOCK-001: Pool 잠금 성공

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-LOCK-001 |
| **테스트 명** | `test_lock_pool_success` |
| **목적** | lock_time 이후 Pool 잠금이 정상 동작하는지 확인 |
| **사전 조건** | - Pool.status == STATUS_OPEN<br>- clock.timestamp_ms >= pool.lock_time |
| **테스트 절차** | 1. AdminCap으로 `lock_pool` 호출<br>2. Pool 상태 변경 확인 |
| **예상 결과** | Pool.status == STATUS_LOCKED |
| **검증 항목** | - status 변경됨<br>- balance는 그대로 유지 |

#### TC-LOCK-002: PoolStatusChanged 이벤트 발생 확인

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-LOCK-002 |
| **테스트 명** | `test_lock_pool_emits_event` |
| **목적** | 풀 잠금 시 이벤트 발생 확인 |
| **검증 항목** | - old_status == STATUS_OPEN<br>- new_status == STATUS_LOCKED |

#### TC-LOCK-003: Pool 미오픈 상태에서 잠금 시도 (E_POOL_NOT_OPEN)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-LOCK-003 |
| **테스트 명** | `test_lock_pool_already_locked` |
| **목적** | 이미 LOCKED 상태에서 재잠금 시 에러 확인 |
| **예상 결과** | `E_POOL_NOT_OPEN (1)` 에러 |

#### TC-LOCK-004: lock_time 이전 잠금 시도 (E_TOO_EARLY)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-LOCK-004 |
| **테스트 명** | `test_lock_pool_too_early` |
| **목적** | lock_time 전에 잠금 시도 시 에러 확인 |
| **사전 조건** | clock.timestamp_ms < pool.lock_time |
| **예상 결과** | `E_TOO_EARLY (11)` 에러 |

---

### 3.5 `finalize_round` 함수

#### TC-FINAL-001: GOLD 승리 정산 성공

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-001 |
| **테스트 명** | `test_finalize_round_gold_wins` |
| **목적** | 금 변동률 > BTC 변동률일 때 GOLD 승리 확인 |
| **사전 조건** | - Pool.status == STATUS_LOCKED<br>- clock.timestamp_ms >= pool.end_time<br>- GOLD: 2650 → 2700 (1.88%)<br>- BTC: 100000 → 101000 (1.00%) |
| **예상 결과** | - winner == WINNER_GOLD<br>- Settlement 생성<br>- Pool.status == STATUS_SETTLED |
| **검증 항목** | - settlement.winner == 1<br>- payout_ratio 계산 정확성<br>- platform_fee == total_pool * 5% |

#### TC-FINAL-002: BTC 승리 정산 성공

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-002 |
| **테스트 명** | `test_finalize_round_btc_wins` |
| **목적** | BTC 변동률 > 금 변동률일 때 BTC 승리 확인 |
| **사전 조건** | - GOLD: 2650 → 2660 (0.37%)<br>- BTC: 100000 → 105000 (5.00%) |
| **예상 결과** | winner == WINNER_BTC |

#### TC-FINAL-003: 동점 시 GOLD 승리

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-003 |
| **테스트 명** | `test_finalize_round_tie_gold_wins` |
| **목적** | 변동률이 동일할 때 GOLD가 승리하는지 확인 |
| **사전 조건** | gold_score == btc_score |
| **예상 결과** | winner == WINNER_GOLD |

#### TC-FINAL-004: 플랫폼 수수료 계산 검증

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-004 |
| **테스트 명** | `test_finalize_round_platform_fee` |
| **목적** | 5% 수수료가 정확히 계산되는지 확인 |
| **사전 조건** | total_pool == 1000 DEL |
| **예상 결과** | - platform_fee == 50 DEL<br>- fee_coin.value == 50 DEL |

#### TC-FINAL-005: 배당률 계산 검증

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-005 |
| **테스트 명** | `test_finalize_round_payout_ratio` |
| **목적** | 배당률이 정확히 계산되는지 확인 |
| **사전 조건** | - total_pool == 1000 DEL<br>- winning_pool (GOLD) == 400 DEL |
| **계산** | payout_ratio = (1000 - 50) * 100 / 400 = 237 (2.37x) |
| **예상 결과** | settlement.payout_ratio == 237 |

#### TC-FINAL-006: SettlementCreated 이벤트 발생 확인

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-006 |
| **테스트 명** | `test_finalize_round_emits_event` |
| **목적** | 정산 시 이벤트 발생 확인 |
| **검증 항목** | - settlement_id<br>- pool_id<br>- round_id<br>- winner<br>- payout_ratio<br>- settled_at |

#### TC-FINAL-007: LOCKED 상태 아닐 때 실패 (E_NOT_LOCKED)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-007 |
| **테스트 명** | `test_finalize_round_not_locked` |
| **목적** | OPEN 상태에서 정산 시도 시 에러 확인 |
| **예상 결과** | `E_NOT_LOCKED (10)` 에러 |

#### TC-FINAL-008: end_time 이전 정산 시도 (E_TOO_EARLY)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-008 |
| **테스트 명** | `test_finalize_round_too_early` |
| **목적** | end_time 전에 정산 시도 시 에러 확인 |
| **예상 결과** | `E_TOO_EARLY (11)` 에러 |

#### TC-FINAL-009: winning_pool이 0일 때 배당률 0

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-009 |
| **테스트 명** | `test_finalize_round_zero_winning_pool` |
| **목적** | 승자 풀이 0일 때 배당률이 0인지 확인 (divide by zero 방지) |
| **사전 조건** | - 모든 베팅이 패자 쪽<br>- GOLD 승리, gold_pool == 0 |
| **예상 결과** | payout_ratio == 0 |

#### TC-FINAL-010: 가격 하락 시 정상 동작

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-FINAL-010 |
| **테스트 명** | `test_finalize_round_price_decrease` |
| **목적** | 가격 하락(음수 변동)도 절대값으로 정상 계산되는지 확인 |
| **사전 조건** | - GOLD: 2700 → 2650 (하락)<br>- BTC: 100000 → 99000 (하락) |
| **예상 결과** | 변동폭 기준 승자 결정 |

---

### 3.6 `distribute_payout` 함수

#### TC-PAYOUT-001: 승자 배당금 지급 성공

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-PAYOUT-001 |
| **테스트 명** | `test_distribute_payout_winner` |
| **목적** | 승자에게 배당금이 정확히 지급되는지 확인 |
| **사전 조건** | - Pool.status == STATUS_SETTLED<br>- Bet.prediction == settlement.winner<br>- bet.amount == 100 DEL<br>- payout_ratio == 237 |
| **계산** | payout = 100 * 237 / 100 = 237 DEL |
| **예상 결과** | 반환된 Coin 값 == 237 DEL |
| **검증 항목** | - Bet 객체 소각됨<br>- Pool balance에서 payout 차감 |

#### TC-PAYOUT-002: 패자 처리 (0 DEL 반환)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-PAYOUT-002 |
| **테스트 명** | `test_distribute_payout_loser` |
| **목적** | 패자에게 0 DEL이 반환되고 Bet이 소각되는지 확인 |
| **사전 조건** | Bet.prediction != settlement.winner |
| **예상 결과** | - 반환된 Coin 값 == 0<br>- Bet 객체 소각됨 |

#### TC-PAYOUT-003: PayoutDistributed 이벤트 발생 확인

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-PAYOUT-003 |
| **테스트 명** | `test_distribute_payout_emits_event` |
| **목적** | 배당금 지급 시 이벤트 발생 확인 |
| **검증 항목** | - settlement_id<br>- bet_id<br>- user<br>- amount<br>- timestamp |

#### TC-PAYOUT-004: 미정산 Pool에서 배당 시도 (E_ALREADY_SETTLED)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-PAYOUT-004 |
| **테스트 명** | `test_distribute_payout_not_settled` |
| **목적** | SETTLED 상태가 아닌 Pool에서 배당 시도 시 에러 확인 |
| **예상 결과** | `E_ALREADY_SETTLED (12)` 에러 |
| **참고** | 에러 코드 네이밍 불일치 (실제로는 "NOT_SETTLED" 의미) |

#### TC-PAYOUT-005: 라운드 불일치 (E_ROUND_MISMATCH)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-PAYOUT-005 |
| **테스트 명** | `test_distribute_payout_round_mismatch` |
| **목적** | Bet과 Settlement의 라운드가 다를 때 에러 확인 |
| **사전 조건** | pool.round_id != settlement.round_id |
| **예상 결과** | `E_ROUND_MISMATCH (14)` 에러 |

#### TC-PAYOUT-006: 여러 승자에게 순차 배당

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-PAYOUT-006 |
| **테스트 명** | `test_distribute_multiple_payouts` |
| **목적** | 여러 승자에게 순차적으로 배당 시 Pool balance 정합성 확인 |
| **테스트 절차** | 1. 3명의 GOLD 베팅자<br>2. GOLD 승리<br>3. 각각에게 순차 배당 |
| **검증 항목** | - 각 payout 정확<br>- 최종 Pool balance == 0 (수수료 제외 후 전액 배당) |

---

### 3.7 통합 테스트 (End-to-End)

#### TC-E2E-001: 전체 라운드 플로우

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-E2E-001 |
| **테스트 명** | `test_full_round_flow` |
| **목적** | Pool 생성 → 베팅 → 잠금 → 정산 → 배당 전체 흐름 검증 |
| **테스트 절차** | 1. Admin: create_pool<br>2. User1: place_bet (GOLD, 100 DEL)<br>3. User2: place_bet (BTC, 200 DEL)<br>4. User3: place_bet (GOLD, 100 DEL)<br>5. Admin: lock_pool<br>6. Admin: finalize_round (GOLD 승리)<br>7. Admin: distribute_payout (User1, User2, User3) |
| **예상 결과** | - total_pool == 400 DEL<br>- platform_fee == 20 DEL<br>- GOLD 승자(User1, User3): 각각 190 DEL 수령<br>- BTC 패자(User2): 0 DEL 수령 |

#### TC-E2E-002: 베팅 없는 라운드

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-E2E-002 |
| **테스트 명** | `test_empty_round` |
| **목적** | 베팅 없이 라운드 진행 시 정상 처리 확인 |
| **예상 결과** | - finalize_round 성공<br>- total_pool == 0<br>- platform_fee == 0<br>- payout_ratio == 0 |

#### TC-E2E-003: 한쪽에만 베팅

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-E2E-003 |
| **테스트 명** | `test_one_sided_betting` |
| **목적** | 한쪽(GOLD)에만 베팅 시 정상 처리 확인 |
| **사전 조건** | - gold_pool == 300 DEL<br>- btc_pool == 0 |
| **케이스** | - GOLD 승리: 배당률 = (300-15)/300 = 0.95x (원금보다 적음)<br>- BTC 승리: 배당할 승자 없음 |

---

## 4. 테스트 헬퍼 함수

`betting.move`에 추가할 테스트 전용 함수:

```move
// ============ Test-only Functions ============
#[test_only]
/// 테스트용 init 호출 헬퍼
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}

#[test_only]
/// Pool 상태 조회 (테스트용)
public fun get_pool_status(pool: &BettingPool): u8 {
    pool.status
}

#[test_only]
/// Pool 통계 조회 (테스트용)
public fun get_pool_stats(pool: &BettingPool): (u64, u64, u64, u64) {
    (pool.total_pool, pool.gold_pool, pool.btc_pool, pool.bet_count)
}

#[test_only]
/// Settlement 조회 (테스트용)
public fun get_settlement_winner(settlement: &Settlement): u8 {
    settlement.winner
}

#[test_only]
/// Settlement 배당률 조회 (테스트용)
public fun get_settlement_payout_ratio(settlement: &Settlement): u64 {
    settlement.payout_ratio
}
```

---

## 5. 테스트 실행 방법

### 5.1 전체 테스트 실행

```bash
cd contracts
sui move test
```

### 5.2 특정 테스트 실행

```bash
# 특정 테스트 함수만 실행
sui move test test_place_bet_gold_success
```

### 5.3 커버리지 확인

```bash
sui move test --coverage
```

### 5.4 verbose 모드

```bash
sui move test -v
```

---

## 부록: 에러 코드 참조

| 코드 | 상수명 | 설명 |
|------|--------|------|
| 1 | `E_POOL_NOT_OPEN` | Pool이 OPEN 상태가 아님 |
| 2 | `E_BETTING_CLOSED` | (미사용) |
| 3 | `E_INVALID_PREDICTION` | prediction이 1, 2가 아님 |
| 4 | `E_INSUFFICIENT_AMOUNT` | 최소 베팅액 미만 |
| 5 | `E_UNAUTHORIZED` | (미사용) |
| 6 | `E_TOO_LATE` | 베팅 마감 시간 초과 |
| 10 | `E_NOT_LOCKED` | LOCKED 상태가 아님 |
| 11 | `E_TOO_EARLY` | 시간 조건 미충족 |
| 12 | `E_ALREADY_SETTLED` | 이미 정산됨 / 정산 안됨 (네이밍 불일치) |
| 13 | `E_NOT_WINNER` | (미사용) |
| 14 | `E_ROUND_MISMATCH` | 라운드 ID 불일치 |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0.0 | 2025-12-04 | 초안 작성 |
