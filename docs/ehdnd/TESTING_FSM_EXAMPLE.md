# FSM 테스트 실전 예제

**목적**: FSM 모듈을 실제로 테스트하면서 배운 패턴과 베스트 프랙티스
**대상**: 처음 테스트를 작성하는 개발자
**작성일**: 2025-11-24
**버전**: v1.0

---

## 📋 목차

1. [테스트 파일 구조](#테스트-파일-구조)
2. [단위 테스트: canTransition](#단위-테스트-cantransition)
3. [통합 테스트: transitionRoundStatus](#통합-테스트-transitionroundstatus)
4. [Mock 패턴](#mock-패턴)
5. [배운 교훈](#배운-교훈)

---

## 테스트 파일 구조

### 디렉토리 구조

```
__tests__/
└── lib/
    └── rounds/
        └── fsm.test.ts  ← FSM 테스트
```

### 기본 템플릿

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { canTransition, transitionRoundStatus } from '@/lib/rounds/fsm';
import type { Round } from '@/lib/rounds/types';
import { registry } from '@/lib/registry';
import { ValidationError, BusinessRuleError } from '@/lib/shared/errors';

describe('FSM Tests', () => {
  // 테스트 그룹화
  describe('canTransition', () => {
    // 단위 테스트
  });

  describe('transitionRoundStatus', () => {
    beforeEach(() => {
      // 각 테스트 전 초기화
      vi.clearAllMocks();
    });

    afterEach(() => {
      // 각 테스트 후 정리
      vi.restoreAllMocks();
    });

    // 통합 테스트
  });
});
```

---

## 단위 테스트: canTransition

### 테스트 전략

`canTransition`은 **순수 함수**이므로 의존성이 없습니다. 다양한 입력에 대한 출력만 검증하면 됩니다.

### 테스트 케이스 설계

```
✅ 허용된 전이 (정상 플로우)
  - SCHEDULED → BETTING_OPEN
  - BETTING_OPEN → BETTING_LOCKED
  - BETTING_LOCKED → PRICE_PENDING
  - PRICE_PENDING → CALCULATING
  - CALCULATING → SETTLED
  - CALCULATING → VOIDED

✅ 취소 전이 (모든 상태에서 가능)
  - SCHEDULED → CANCELLED
  - BETTING_OPEN → CANCELLED
  - ...

❌ 거부된 전이
  - 역방향 전이 (BETTING_LOCKED → BETTING_OPEN)
  - 단계 건너뛰기 (SCHEDULED → CALCULATING)
  - 종료 상태에서의 전이 (SETTLED → *)
```

### 실제 코드 예제

```typescript
describe('canTransition', () => {
  describe('허용된 정방향 전이', () => {
    it('SCHEDULED → BETTING_OPEN을 허용한다', () => {
      expect(canTransition('SCHEDULED', 'BETTING_OPEN')).toBe(true);
    });

    it('BETTING_OPEN → BETTING_LOCKED를 허용한다', () => {
      expect(canTransition('BETTING_OPEN', 'BETTING_LOCKED')).toBe(true);
    });

    // ... 나머지 정상 전이
  });

  describe('거부된 역방향 전이', () => {
    it('BETTING_LOCKED → BETTING_OPEN을 거부한다', () => {
      expect(canTransition('BETTING_LOCKED', 'BETTING_OPEN')).toBe(false);
    });

    // ... 나머지 역방향 전이
  });

  describe('종료 상태에서의 전이 거부', () => {
    it('SETTLED 상태에서는 어떤 전이도 허용하지 않는다', () => {
      const allStatuses: RoundStatus[] = [
        'SCHEDULED',
        'BETTING_OPEN',
        'BETTING_LOCKED',
        'PRICE_PENDING',
        'CALCULATING',
        'SETTLED',
        'CANCELLED',
        'VOIDED',
      ];

      allStatuses.forEach((targetStatus) => {
        expect(canTransition('SETTLED', targetStatus)).toBe(false);
      });
    });
  });
});
```

**포인트**:

- 단순한 입력-출력 검증
- `forEach`를 활용한 반복 테스트로 코드 중복 제거
- 명확한 테스트 이름 (한글 사용 OK)

---

## 통합 테스트: transitionRoundStatus

### 테스트 전략

`transitionRoundStatus`는 **RoundService**에 의존합니다. Service를 **Mock**으로 대체하여 테스트합니다.

### Mock Round 데이터 준비

```typescript
describe('transitionRoundStatus', () => {
  const now = Date.now();
  const mockRound: Round = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    roundNumber: 1,
    type: '6HOUR',
    status: 'SCHEDULED',
    startTime: now + 60000,
    endTime: now + 21660000,
    lockTime: now + 21600000,
    totalPool: 0,
    totalGoldBets: 0,
    totalBtcBets: 0,
    totalBetsCount: 0,
    // ... 나머지 필드
    platformFeeRate: '0.05',
    platformFeeCollected: 0,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 테스트 케이스들...
});
```

**주의사항**:

- DB 스키마의 모든 필드를 포함해야 타입 에러가 없음
- `totalBetsCount`, `platformFeeRate` 같은 필드를 빠뜨리지 말 것

### 입력 검증 테스트

```typescript
describe('입력 검증', () => {
  it('유효하지 않은 UUID 형식이면 ValidationError를 던진다', async () => {
    await expect(transitionRoundStatus('invalid-uuid', 'BETTING_OPEN')).rejects.toThrow(
      ValidationError,
    );
  });

  it('UUID 형식이지만 라운드가 존재하지 않으면 NotFoundError를 던진다', async () => {
    const mockService = {
      getRoundById: vi.fn().mockRejectedValue(new NotFoundError('Round', mockRound.id)),
      updateRoundById: vi.fn(),
    };

    registry.setRoundService(mockService as unknown as typeof registry.roundService);

    await expect(transitionRoundStatus(mockRound.id, 'BETTING_OPEN')).rejects.toThrow(
      NotFoundError,
    );

    expect(mockService.getRoundById).toHaveBeenCalledWith(mockRound.id);
  });
});
```

**포인트**:

- `rejects.toThrow()`를 사용한 비동기 에러 검증
- Mock을 registry에 주입
- 호출 검증 (`toHaveBeenCalledWith`)

### 비즈니스 규칙 테스트

```typescript
describe('전이 규칙 검증', () => {
  it('허용되지 않은 전이면 BusinessRuleError를 던진다', async () => {
    const settledRound = { ...mockRound, status: 'SETTLED' };

    const mockService = {
      getRoundById: vi.fn().mockResolvedValue(settledRound),
      updateRoundById: vi.fn(),
    };

    registry.setRoundService(mockService as unknown as typeof registry.roundService);

    await expect(transitionRoundStatus(mockRound.id, 'BETTING_OPEN')).rejects.toThrow(
      BusinessRuleError,
    );

    expect(mockService.updateRoundById).not.toHaveBeenCalled();
  });
});
```

**포인트**:

- 스프레드 연산자 (`...`)를 활용한 데이터 변형
- 호출되지 않았음을 검증 (`not.toHaveBeenCalled`)

### 멱등성 테스트

```typescript
describe('멱등성 보장', () => {
  it('이미 목표 상태면 업데이트 없이 현재 라운드를 반환한다', async () => {
    const openRound = { ...mockRound, status: 'BETTING_OPEN' };

    const mockService = {
      getRoundById: vi.fn().mockResolvedValue(openRound),
      updateRoundById: vi.fn(),
    };

    registry.setRoundService(mockService as unknown as typeof registry.roundService);

    const result = await transitionRoundStatus(mockRound.id, 'BETTING_OPEN');

    expect(result).toEqual(openRound);
    expect(mockService.updateRoundById).not.toHaveBeenCalled();
  });
});
```

**핵심 개념**:

- **멱등성 (Idempotency)**: 같은 작업을 여러 번 수행해도 결과가 동일
- 재시도 안전성을 보장하는 중요한 속성

### 성공 시나리오 테스트

```typescript
describe('성공적인 전이', () => {
  it('SCHEDULED → BETTING_OPEN 전이가 성공한다', async () => {
    const metadata = {
      goldStartPrice: '2650.50',
      btcStartPrice: '98234.00',
      priceSnapshotStartAt: Date.now(),
      startPriceSource: 'kitco',
      suiPoolAddress: '0x123',
      bettingOpenedAt: Date.now(),
    };

    const updatedRound = {
      ...mockRound,
      status: 'BETTING_OPEN',
      ...metadata,
    };

    const mockService = {
      getRoundById: vi.fn().mockResolvedValue(mockRound),
      updateRoundById: vi.fn().mockResolvedValue(updatedRound),
    };

    registry.setRoundService(mockService as unknown as typeof registry.roundService);

    const result = await transitionRoundStatus(mockRound.id, 'BETTING_OPEN', metadata);

    expect(result.status).toBe('BETTING_OPEN');
    expect(mockService.updateRoundById).toHaveBeenCalledWith(
      mockRound.id,
      expect.objectContaining({
        status: 'BETTING_OPEN',
        ...metadata,
      }),
    );
  });
});
```

**포인트**:

- `expect.objectContaining()`으로 부분 매칭
- metadata가 올바르게 전달되는지 검증

### 전체 라이프사이클 테스트

```typescript
describe('전체 라이프사이클 테스트', () => {
  it('SCHEDULED → BETTING_OPEN → ... → SETTLED 전체 플로우를 완료한다', async () => {
    let currentRound = { ...mockRound };

    const mockService = {
      getRoundById: vi.fn().mockImplementation(() => Promise.resolve(currentRound)),
      updateRoundById: vi.fn().mockImplementation((_id: string, data: Partial<Round>) => {
        currentRound = { ...currentRound, ...data };
        return Promise.resolve(currentRound);
      }),
    };

    registry.setRoundService(mockService as unknown as typeof registry.roundService);

    // 1. SCHEDULED → BETTING_OPEN
    await transitionRoundStatus(mockRound.id, 'BETTING_OPEN', {
      goldStartPrice: '2650.50',
      btcStartPrice: '98234.00',
      priceSnapshotStartAt: Date.now(),
      startPriceSource: 'kitco',
      suiPoolAddress: '0x123',
      bettingOpenedAt: Date.now(),
    });
    expect(currentRound.status).toBe('BETTING_OPEN');

    // 2. BETTING_OPEN → BETTING_LOCKED
    await transitionRoundStatus(mockRound.id, 'BETTING_LOCKED', {
      bettingLockedAt: Date.now(),
    });
    expect(currentRound.status).toBe('BETTING_LOCKED');

    // ... 나머지 전이들

    // 5. CALCULATING → SETTLED
    await transitionRoundStatus(mockRound.id, 'SETTLED', {
      platformFeeCollected: 100,
      suiSettlementObjectId: '0x456',
      settlementCompletedAt: Date.now(),
    });
    expect(currentRound.status).toBe('SETTLED');
  });
});
```

**고급 테크닉**:

- `mockImplementation`으로 상태를 유지하는 Mock 생성
- 실제 사용 시나리오를 시뮬레이션

---

## Mock 패턴

### RoundService Mock 생성 패턴

```typescript
// 기본 패턴
const mockService = {
  getRoundById: vi.fn().mockResolvedValue(mockRound),
  updateRoundById: vi.fn().mockResolvedValue(updatedRound),
};

// 에러를 던지는 패턴
const mockService = {
  getRoundById: vi.fn().mockRejectedValue(new NotFoundError('Round', id)),
  updateRoundById: vi.fn(),
};

// 상태를 유지하는 패턴
let currentRound = { ...mockRound };
const mockService = {
  getRoundById: vi.fn().mockImplementation(() => Promise.resolve(currentRound)),
  updateRoundById: vi.fn().mockImplementation((_id, data) => {
    currentRound = { ...currentRound, ...data };
    return Promise.resolve(currentRound);
  }),
};
```

### Registry 주입

```typescript
// Mock을 registry에 주입
registry.setRoundService(mockService as unknown as typeof registry.roundService);

// 테스트 후 정리 (선택적)
// registry.reset(); // registry가 reset 메서드를 제공하는 경우
```

**타입 캐스팅**:

- `as unknown as typeof registry.roundService`를 사용하여 타입 에러 우회
- 테스트 환경에서는 필요한 메서드만 구현하면 됨

---

## 배운 교훈

### 1. 테스트 작성 순서

1. **단순한 것부터**: `canTransition` 같은 순수 함수 먼저
2. **의존성이 적은 것부터**: Mock이 적을수록 작성이 쉬움
3. **성공 케이스 → 실패 케이스**: 정상 플로우를 먼저 확인

### 2. Mock 데이터 준비의 중요성

```typescript
// ❌ 나쁜 예: 필드 누락으로 타입 에러
const mockRound = {
  id: 'xxx',
  status: 'SCHEDULED',
  // totalBetsCount, platformFeeRate 등 누락!
};

// ✅ 좋은 예: 모든 필드 포함
const mockRound: Round = {
  // DB 스키마의 모든 필드 포함
  totalBetsCount: 0,
  platformFeeRate: '0.05',
  // ...
};
```

### 3. 비동기 테스트는 항상 await

```typescript
// ❌ 나쁜 예
expect(asyncFunction()).rejects.toThrow(); // await 없음!

// ✅ 좋은 예
await expect(asyncFunction()).rejects.toThrow();
```

### 4. 멱등성 체크 순서가 중요

**버그 발견**: 멱등성 체크를 전이 가능 여부 검증 이후에 했더니 실패
**해결**: 멱등성 체크를 먼저 수행하도록 순서 변경

```typescript
// ✅ 올바른 순서
if (currentStatus === newStatus) {
  return round; // 멱등성: 이미 목표 상태면 스킵
}

if (!canTransition(currentStatus, newStatus)) {
  throw new BusinessRuleError(...); // 전이 불가능
}
```

### 5. 테스트 격리의 중요성

```typescript
// ✅ 각 테스트마다 초기화
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**이유**: 테스트 간 간섭 방지

### 6. 명확한 테스트 이름

```typescript
// ❌ 나쁜 예
it('test1', () => { ... });
it('should work', () => { ... });

// ✅ 좋은 예
it('유효하지 않은 UUID 형식이면 ValidationError를 던진다', () => { ... });
it('멱등성: 같은 상태로 재전이 시도 시 업데이트 없이 반환한다', () => { ... });
```

---

## 다음 단계

1. **RoundService 테스트 작성**
   - 이 패턴을 참고하여 Service 레이어 테스트
   - Repository는 Mock으로 대체

2. **RoundRepository 테스트 작성**
   - better-sqlite3 인메모리 DB 사용
   - 실제 쿼리 동작 검증

3. **Controller 테스트 작성**
   - Service를 Mock으로 대체
   - HTTP 요청/응답 검증

---

**참고 문서**:

- [TESTING_GUIDE.md](./TESTING_GUIDE.md): 전체 테스트 전략
- [FSM_IMPLEMENTATION_GUIDE.md](./FSM_IMPLEMENTATION_GUIDE.md): FSM 구현 가이드
- [Vitest 공식 문서](https://vitest.dev/)
