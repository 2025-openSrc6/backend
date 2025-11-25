# Cron Job 구현 노트 (현재 결정 사항)

최근 논의/수정 사항을 빠르게 찾아볼 수 있도록 정리했습니다. 세부 흐름은 `CRON_JOB_SPECIFICATION.md`를 따릅니다.

## 핵심 결정

- PRICE_PENDING 제거 → FSM은 `BETTING_LOCKED → CALCULATING` 단일 전이로 단순화. DB 초기화 가능 상태이므로 상태 축소를 선택.
- Job 4는 가격 스냅샷·승자 판정·배당 계산을 모두 끝낸 뒤에만 상태 전이를 시작한다. 계산 전에 상태를 바꾸지 않는다.
- Job 4가 Job 5를 **내부 Service 호출**로 즉시 트리거하는 것을 기본으로 한다 (`roundService.settleRound`). HTTP fetch 호출은 대안이며 실패 시 에러를 던져 CALCULATING 상태에 머물게 한다.
- Recovery는 CALCULATING을 우선 모니터링/재시도한다. 필요하면 BETTING_LOCKED + endTime 지난 라운드를 Job 4 재호출로 확장.
- Service 레이어는 HTTP 유틸을 알지 못하며, 에러는 `lib/shared/errors.ts`의 클래스만 던진다. Route가 `handleApiError`로 변환 + Slack 알림을 처리한다.

## 에러 코드 가이드 (Service → Route)

- 시간 조건 불충족: `BusinessRuleError('ROUND_NOT_READY', ...)`
- 필수 데이터 없음: `BusinessRuleError('ROUND_DATA_MISSING', { missing })`
- 상태 전이 불가: `BusinessRuleError('INVALID_TRANSITION', ...)` (FSM)
- 가격 조회 실패: `ServiceError('PRICE_FETCH_FAILED', { cause })`
- Job 5 트리거 실패: `ServiceError('SETTLEMENT_TRIGGER_FAILED', { cause })`
- 기타 알 수 없는 예외: `ServiceError('INTERNAL_ERROR', { cause })`
- 실패 시 상태를 미리 바꾸지 않는다. 계산 전 실패 → BETTING_LOCKED 유지, 전이 후 실패 → CALCULATING 유지.

## 열려있는 TODO/주의점

- 가격 조회 함수(`getPrices` 또는 동등한 Service) 구현/주입 필요. 실패 시 위 코드에 맞춰 throw 해야 함.
- `roundService.settleRound`(또는 동등한 Settlement Service) 구현 필요. 멱등성 확보 및 Recovery 재시도 가능하도록 설계.
- FSM/테스트/코드에서 PRICE_PENDING 제거 반영 필요(전이 검증, 메타데이터 필수 필드 업데이트 포함).

## 이번 작업 요약 (2025-xx-xx)

- FSM 단순화: PRICE_PENDING 제거, BETTING_LOCKED → CALCULATING만 허용. 상수/타입/테스트 갱신.
- RoundService.finalizeRound: 필수 필드 검증 → 승자/배당 계산 → CALCULATING 전이 → settleRound 호출. 비즈니스/서비스 에러만 던지고 나머지는 INTERNAL_ERROR 래핑.
- 테스트: FSM 단위 테스트와 RoundService 테스트를 새 흐름에 맞춰 업데이트. CALCULATING 전이 필수 메타 검증과 finalize 성공 케이스 커버.
- 문서: CRON_JOB_SPECIFICATION 업데이트(PRICE_PENDING 제거, Job5 트리거 방식), 구현 노트 생성/갱신.

## 앞으로 할 일

- Settlement 구현: `roundService.settleRound` (또는 별도 Settlement Service) 완성, CALCULATING → SETTLED 전이 멱등 처리, Job5 라우트는 얇게 유지.
- 가격 스냅샷 연결: finalize route에서 실제 `getPrices`(또는 주입된 price service) 사용, 테스트에서는 vi.mock으로 가격 주입.
- 스키마/이전 데이터: rounds.status enum 및 관련 필드에서 PRICE_PENDING 사용이 없도록 검증. DB 초기화 가능 상태이므로 필요 시 스키마/마이그레이션도 정리.
