# 테스트 작성 체크리스트

**목적**: 테스트 작성 시 빠뜨리지 말아야 할 항목들
**대상**: 모든 개발자
**작성일**: 2025-11-24

---

## 📋 테스트 시작 전 체크리스트

### 환경 설정

- [ ] `vitest.config.ts` 설정 확인
- [ ] `vitest.setup.ts` 확인
- [ ] `package.json`에 테스트 스크립트 존재 확인
  ```json
  {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
  ```
- [ ] 의존성 설치 확인 (`vitest`, `@vitest/coverage-v8`, `@vitest/ui`)

### 디렉토리 구조

- [ ] `__tests__/` 디렉토리 생성
- [ ] 테스트 파일 위치 결정 (소스와 동일한 구조 유지)
  ```
  lib/rounds/fsm.ts → __tests__/lib/rounds/fsm.test.ts
  ```

---

## 📝 테스트 파일 작성 체크리스트

### 1. 파일 헤더

- [ ] 필요한 import 추가
  ```typescript
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  ```
- [ ] 테스트 대상 함수/클래스 import
- [ ] 타입 import
- [ ] 에러 클래스 import (필요 시)

### 2. 테스트 구조

- [ ] `describe` 블록으로 테스트 그룹화
- [ ] 중첩된 `describe`로 논리적 계층 구성
- [ ] `beforeEach`/`afterEach`로 테스트 격리

  ```typescript
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  ```

### 3. 테스트 케이스

- [ ] AAA 패턴 적용 (Arrange-Act-Assert)

  ```typescript
  it('테스트 설명', () => {
    // Arrange: 준비
    const input = ...;

    // Act: 실행
    const result = functionUnderTest(input);

    // Assert: 검증
    expect(result).toBe(expected);
  });
  ```

- [ ] 명확한 테스트 이름 작성
- [ ] 하나의 테스트는 하나의 사항만 검증

---

## 🎯 테스트 케이스 커버리지 체크리스트

### 단위 테스트 (순수 함수)

- [ ] **정상 케이스**: 기대하는 입력에 대한 올바른 출력
- [ ] **경계 케이스**: 빈 값, null, undefined, 0, 빈 배열 등
- [ ] **에러 케이스**: 잘못된 입력, 유효하지 않은 값

**예시**: `canTransition(from, to)`

- [x] 허용된 전이
- [x] 거부된 전이
- [x] 종료 상태에서의 전이

### 통합 테스트 (의존성 있는 함수)

- [ ] **Mock 준비**: 필요한 의존성을 Mock으로 대체
- [ ] **정상 플로우**: 성공 시나리오
- [ ] **에러 처리**: 의존성이 에러를 던질 때
- [ ] **입력 검증**: 잘못된 입력 처리
- [ ] **비즈니스 규칙**: 도메인 규칙 검증
- [ ] **멱등성**: 같은 작업 반복 시 결과 동일

**예시**: `transitionRoundStatus(roundId, newStatus, metadata)`

- [x] UUID 검증
- [x] 라운드 존재 여부
- [x] 전이 규칙 검증
- [x] 멱등성 보장
- [x] 필수 필드 검증
- [x] 성공 시나리오

### Service 레이어

- [ ] **입력 검증**: Zod 스키마 검증
- [ ] **비즈니스 로직**: 계산, 변환, 검증
- [ ] **에러 매핑**: Repository 에러를 Service 에러로 변환
- [ ] **Repository 호출**: 올바른 파라미터 전달

### Repository 레이어

- [ ] **쿼리 정확성**: 올바른 결과 반환
- [ ] **필터링**: where 조건 동작
- [ ] **정렬**: order by 동작
- [ ] **페이지네이션**: offset, limit 동작
- [ ] **빈 결과**: 데이터가 없을 때

### Controller 레이어

- [ ] **HTTP 계약**: 요청 → Service → 응답
- [ ] **쿼리 파라미터**: Service에 올바르게 전달
- [ ] **에러 핸들링**: Service 에러를 HTTP 상태 코드로 변환
- [ ] **응답 형식**: `createSuccessResponse` 사용

---

## 🔧 Mock 작성 체크리스트

### Mock 데이터

- [ ] **타입 정확성**: 실제 타입과 일치 (`const mockRound: Round = { ... }`)
- [ ] **필수 필드**: 모든 필수 필드 포함
- [ ] **현실적인 데이터**: 실제 사용 시나리오를 반영

### Mock 함수

- [ ] `vi.fn()` 사용
- [ ] `mockResolvedValue()` (성공) 또는 `mockRejectedValue()` (에러)
- [ ] `mockImplementation()` (복잡한 로직 필요 시)
- [ ] 호출 검증 (`toHaveBeenCalled`, `toHaveBeenCalledWith`)

### Registry/의존성 주입

- [ ] Mock을 registry에 주입
  ```typescript
  registry.setRoundService(mockService as unknown as typeof registry.roundService);
  ```
- [ ] 테스트 후 정리 (필요 시)

---

## ✅ 테스트 실행 체크리스트

### 로컬 실행

- [ ] `npm test` 실행하여 모든 테스트 통과 확인
- [ ] `npm run test:watch` 사용하여 개발 중 실시간 피드백
- [ ] `npm run test:coverage` 실행하여 커버리지 확인

### 커버리지 확인

- [ ] 새로 작성한 파일의 커버리지 80% 이상
- [ ] 중요 비즈니스 로직의 모든 분기 커버
- [ ] 에러 경로도 테스트

### 코드 품질

- [ ] Lint 에러 없음
- [ ] 타입 에러 없음
- [ ] 테스트 이름이 명확함
- [ ] 불필요한 console.log 제거

---

## 🐛 디버깅 체크리스트

### 테스트 실패 시

- [ ] 에러 메시지 정확히 읽기
- [ ] 실패한 assertion 확인
- [ ] Mock이 올바르게 설정되었는지 확인
- [ ] 비동기 함수에 `await` 있는지 확인
- [ ] `npm run test:ui` 사용하여 디버깅

### 간헐적 실패 시

- [ ] 테스트 격리 확인 (`beforeEach`/`afterEach`)
- [ ] Mock 초기화 확인 (`vi.clearAllMocks()`)
- [ ] 시간 의존성 확인 (필요 시 `vi.useFakeTimers()`)
- [ ] 테스트 순서 의존성 확인 (각 테스트는 독립적이어야 함)

---

## 📦 커밋 전 체크리스트

- [ ] 모든 테스트 통과 (`npm test`)
- [ ] 커버리지 목표 달성 (`npm run test:coverage`)
- [ ] Lint 통과 (`npm run lint`)
- [ ] 타입 체크 통과 (`tsc --noEmit`)
- [ ] 불필요한 파일 제거 (디버깅용 console.log 등)
- [ ] 테스트 파일 커밋 (`__tests__/**/*.test.ts`)

---

## 🎓 베스트 프랙티스

### DRY 원칙

- [ ] 반복되는 Mock 데이터는 헬퍼 함수로 추출
- [ ] 공통 setup/teardown은 `beforeEach`/`afterEach`로

### 읽기 쉬운 테스트

- [ ] 테스트 이름만 읽어도 무엇을 검증하는지 알 수 있음
- [ ] 너무 긴 테스트는 분리 (100줄 이상이면 분리 고려)
- [ ] 주석은 최소한으로 (코드 자체가 설명이 되도록)

### 유지보수성

- [ ] 테스트가 구현이 아닌 동작을 검증
- [ ] 내부 구현 변경 시에도 테스트는 깨지지 않음
- [ ] 실제 사용 시나리오를 반영

---

## 📚 참고 자료

- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - 전체 테스트 전략
- [TESTING_FSM_EXAMPLE.md](./TESTING_FSM_EXAMPLE.md) - FSM 테스트 실전 예제
- [Vitest 공식 문서](https://vitest.dev/)

---

**이 체크리스트를 프린트하여 책상에 붙여두고 참고하세요!**
