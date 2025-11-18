# DELTAX 테스트 전략 & Vitest 가이드

**대상**: 라운드/DB 도메인을 처음 테스트하려는 개발자  
**목적**: Vitest 기반 환경을 구축하고 계층별 베스트 프랙티스를 익혀 “테스트 가능한 구조”를 몸에 익힘  
**작성일**: 2025-02-15  
**버전**: v1 (Jest 버전 폐기, Vitest 표준안)

---

## 📋 목차

1. [테스트 철학과 커버리지 전략](#테스트-철학과-커버리지-전략)
2. [Vitest 환경 구축](#vitest-환경-구축)
3. [계층별 테스트 전략](#계층별-테스트-전략)
4. [샘플 코드 워크스루](#샘플-코드-워크스루)
5. [실행, CI, 품질 게이트](#실행-ci-품질-게이트)
6. [FAQ & 성장 노트](#faq--성장-노트)

---

## 테스트 철학과 커버리지 전략

| 계층                                    | 목적                         | 추천 테스트 유형            | 비고                     |
| --------------------------------------- | ---------------------------- | --------------------------- | ------------------------ |
| Repository (`lib/rounds/repository.ts`) | ORM 쿼리/SQL 정확성          | 인메모리 DB 통합 테스트     | Drizzle + better-sqlite3 |
| Service (`lib/rounds/service.ts`)       | 비즈니스 규칙/검증/에러 전달 | 순수 단위 테스트(Mock Repo) | ROI 가장 높음            |
| Controller (`app/api/rounds/*`)         | HTTP ↔ Service 계약         | 라우트 계약 테스트          | `registry`에 Stub 주입   |
| Postman/E2E                             | 실제 런타임 확인             | 수동 or 스모크 자동화       | 배포 전 최종 확인        |

원칙:

1. **테스트 피라미드** 유지: Service > Repository > Controller > E2E 순으로 케이스 수를 줄인다.
2. **가장 비싼 테스트(E2E)** 는 대표 시나리오만, 나머지는 단위/통합에 몰아준다.
3. **테스트 가능 설계**: 의존성 주입(RoundService ← RoundRepository), 전역 `registry`를 통한 Stub 교체 등은 바로 테스트 용도.
4. **테스트 실패는 곧 피드백**: “왜 실패했는지”를 설명할 수 있게 명확한 에러 메시지/테스트 네이밍을 사용한다.

커버리지 목표(초기):

- Service 파일: 80%+
- Repository: 70%+
- Controller: 대표 성공/실패 케이스 (라인 커버리지보다는 시나리오 위주)
- 프로젝트 전체: 60% 이상 → 안정화되면 75% 목표

---

## Vitest 환경 구축

### 1. 의존성 설치

```bash
npm install --save-dev vitest @vitest/coverage-v8 @vitest/ui tsx
```

선택 사항:

- `happy-dom` 또는 `jsdom`: 브라우저 환경 테스트가 필요할 때. 이번 라운드 API 테스트는 `node` 환경이면 충분.
- `supertest` 대신 Next Route는 Request 객체로 직접 호출 가능.

### 2. tsconfig 경로 정리

이미 `@/` alias가 존재한다면 `tsconfig.json`에 아래가 있는지 확인:

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@/*": ["*"],
    },
  },
}
```

Vitest는 Vite resolver를 사용하므로 `vitest.config.ts`에도 alias를 맞춰줘야 한다.

### 3. vitest.config.ts 생성

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      lines: 0.6,
      functions: 0.6,
      branches: 0.5,
    },
  },
  resolve: {
    alias: {
      '@': new URL('.', import.meta.url).pathname,
    },
  },
});
```

팁:

- `environment`는 백엔드/서비스 테스트 시 `node`. UI 테스트 추가 시 `environmentMatchGlobs`를 사용해 파일별로 `jsdom`을 지정할 수 있다.
- Next 16의 Edge 런타임을 흉내 낼 필요는 없음. Service/Repository 테스트는 Node API만 쓰기 때문.

### 4. vitest.setup.ts

```ts
import { beforeAll, afterAll, afterEach, beforeEach, vi, expect } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.resetAllMocks();
});

declare module 'vitest' {
  export interface TestContext {
    // 필요 시 커스텀 컨텍스트 타입 선언
  }
}
```

선택: `expect.extend`로 커스텀 matcher를 등록할 수도 있다.

### 5. npm scripts 업데이트

```jsonc
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest run --coverage"
}
```

CI에서는 `vitest run --coverage --runInBand` 대신 Vitest가 기본적으로 워커를 사용하므로 별도 직렬 실행 옵션 없이도 충분하다. 단, SQLite 파일을 공유할 경우 `--runInBand` 고려.

---

## 계층별 테스트 전략

### 1. Repository (Drizzle + better-sqlite3)

- **목표**: 쿼리 결과가 문서/스키마 사양과 일치하는지 검증.
- **환경 구성**:
  1. `better-sqlite3` 인메모리 DB(`':memory:'`).
  2. `drizzle-orm/better-sqlite3`로 Drizzle 인스턴스 생성.
  3. 테스트 전마다 스키마를 생성하거나 트랜잭션을 롤백.
  4. Repository가 현재 `getDb()`에 의존 → 테스트 전용 Repository를 만들거나 `getDb`를 주입받도록 refactor (권장). 예: `constructor(private getDbFn = getDb)` 형태.
- **주요 시나리오**:
  - `findMany`: type/status 필터, 정렬, 페이지네이션.
  - `count`: 동일 필터 적용 여부.
  - `findCurrentRound`: BETTING_OPEN/LOCKED만, 최신 startTime 순.
  - `checkOverlappingTime`: 시간 겹침 조건.
  - `getLastRoundNumber`: 타입별 마지막 번호.
  - `insert`: 기본 필드 저장, 반환값 확인.

### 2. Service (비즈니스 로직)

- **Mock 전략**: `vi.fn()`을 사용해 `RoundRepository` 인터페이스를 구현.
- **시간 의존성**: `vi.useFakeTimers()` + `vi.setSystemTime()`으로 고정.
- **검증 포인트**:
  - `getRounds`: Zod 검증 실패, pagination 계산, repository 호출 파라미터.
  - `getRoundById`: UUID 정규식 검증, `NotFoundError`.
  - `getCurrentRound`: 퍼센트/남은 시간/`canBet`.
  - `createRound`: duration 계산, 중복 시간 체크, roundNumber 증가, DB 에러를 BusinessRuleError/ServiceError로 매핑.

### 3. Controller (Next Route Handlers)

- **의존성 치환**: `registry.setRoundService(stubService)` 사용. 테스트 종료 후 `registry.reset()`.
- **테스트 대상**:
  - 올바른 Query/Body를 Service에 넘기는지.
  - Service가 던진 도메인 에러가 `handleApiError`를 통해 올바른 HTTP status/페이로드로 변환되는지.
  - 성공시 response JSON 구조(`createSuccessResponse`/`createSuccessResponseWithMeta`) 확인.

### 4. Postman/E2E

- Vitest로 모든 로직을 커버한 뒤, Postman Collection(`postman_collection.json`)을 사용해 실제 DB + 런타임에서 최종 확인.
- 자동화를 원하면 CI에서 Postman CLI(newman)를 사용하거나, Cloudflare Workers 환경에 맞춘 스모크 테스트를 추가할 수 있다.

---

## 샘플 코드 워크스루

### 1. Service 단위 테스트

`lib/rounds/service.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { RoundService } from './service';
import type { RoundRepository } from './repository';
import { ValidationError } from '@/lib/shared/errors';

const createRepoMock = (): Mocked<RoundRepository> =>
  ({
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findCurrentRound: vi.fn(),
    checkOverlappingTime: vi.fn(),
    getLastRoundNumber: vi.fn(),
    insert: vi.fn(),
  }) as Mocked<RoundRepository>;

describe('RoundService.getRounds', () => {
  let repo: ReturnType<typeof createRepoMock>;
  let service: RoundService;

  beforeEach(() => {
    repo = createRepoMock();
    service = new RoundService(repo);
  });

  it('pagination 메타데이터를 계산한다', async () => {
    repo.findMany.mockResolvedValue([{ id: 'round-1' } as any]);
    repo.count.mockResolvedValue(5);

    const result = await service.getRounds({
      type: '6HOUR',
      page: '2',
      pageSize: '2',
    });

    expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({ offset: 2, limit: 2 }));
    expect(result.meta.totalPages).toBe(3);
  });

  it('잘못된 page 값이면 ValidationError', async () => {
    await expect(service.getRounds({ page: '0' })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

포인트:

- Vitest도 Jest와 유사한 API(`describe`, `it`, `expect`, `vi`).
- `createRepoMock`는 최소 구현만 포함. 타입 헬퍼가 필요하면 `type RoundRepositoryMock = Mocked<RoundRepository>;` 선언.

### 2. Service + 시간 계산

```ts
describe('RoundService.getCurrentRound', () => {
  it('timeRemaining과 canBet을 계산한다', async () => {
    const repo = createRepoMock();
    const now = new Date('2024-01-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    repo.findCurrentRound.mockResolvedValue({
      id: 'r1',
      type: '6HOUR',
      status: 'BETTING_OPEN',
      startTime: now.getTime() - 1000,
      lockTime: now.getTime() + 60_000,
      endTime: now.getTime() + 120_000,
      totalPool: 100,
      totalGoldBets: 30,
      totalBtcBets: 70,
    } as any);

    const result = await new RoundService(repo).getCurrentRound('6HOUR');
    expect(result.bettingTimeRemaining).toBe(60);
    expect(result.canBet).toBe(true);
    expect(result.goldBetsPercentage).toBe('30.00');
  });
});
```

### 3. Repository 통합 테스트

`lib/rounds/repository.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { RoundRepository } from './repository';
import { rounds } from '@/db/schema';

const createRepo = () => {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  sqlite.exec(`
    CREATE TABLE rounds (
      id TEXT PRIMARY KEY,
      round_number INTEGER,
      type TEXT,
      status TEXT,
      start_time INTEGER,
      end_time INTEGER,
      lock_time INTEGER,
      total_pool INTEGER,
      total_gold_bets INTEGER,
      total_btc_bets INTEGER
    );
  `);
  return new RoundRepository(() => db);
};

describe('RoundRepository.findCurrentRound', () => {
  let repo: RoundRepository;

  beforeEach(() => {
    repo = createRepo();
  });

  it('BETTING_OPEN 또는 BETTING_LOCKED 중 가장 최근 항목을 반환한다', async () => {
    const now = Date.now();
    await repo.insert({
      id: 'r1',
      roundNumber: 1,
      type: '6HOUR',
      status: 'BETTING_OPEN',
      startTime: now - 1000,
      endTime: now + 1000,
      lockTime: now + 500,
    });
    await repo.insert({
      id: 'r2',
      roundNumber: 2,
      type: '6HOUR',
      status: 'SCHEDULED',
      startTime: now + 10_000,
      endTime: now + 20_000,
      lockTime: now + 10_500,
    });

    const round = await repo.findCurrentRound('6HOUR');
    expect(round?.id).toBe('r1');
  });
});
```

> 실제 schema에서는 snake_case → camelCase 매핑을 Drizzle schema가 처리한다. 예시는 개념 전달용이며, 실제 프로젝트에 맞게 `rounds` 정의를 import하여 `db.insert(rounds).values()` 사용을 권장.

### 4. Controller 테스트

`app/api/rounds/current/route.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from './route';
import { registry } from '@/lib/registry';

describe('GET /api/rounds/current', () => {
  beforeEach(() => {
    registry.reset();
  });

  it('type 쿼리를 서비스에 전달하고 응답을 감싼다', async () => {
    const mockRound = { id: 'r1', type: '6HOUR' };
    registry.setRoundService({
      getCurrentRound: vi.fn().mockResolvedValue(mockRound),
    } as any);

    const request = new Request('http://localhost/api/rounds/current?type=6HOUR');
    const response = await GET(request as any);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.data).toEqual(mockRound);
  });

  it('서비스에서 던진 에러를 handleApiError가 처리한다', async () => {
    const error = new Error('boom');
    registry.setRoundService({
      getCurrentRound: vi.fn().mockRejectedValue(error),
    } as any);

    const request = new Request('http://localhost/api/rounds/current?type=6HOUR');
    const response = await GET(request as any);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
```

---

## 실행, CI, 품질 게이트

| 상황           | 명령어                  | 설명                                   |
| -------------- | ----------------------- | -------------------------------------- |
| 빠른 개발 루프 | `npm run test:watch`    | 수정 즉시 재실행                       |
| 전체 테스트    | `npm run test`          | CI와 동일한 run 모드                   |
| UI 모드        | `npm run test:ui`       | 실패 테스트만 집중 디버깅              |
| 커버리지       | `npm run test:coverage` | `coverage/lcov-report/index.html` 확인 |

CI 파이프라인 예시:

1. `npm ci`
2. (필요 시) `npm run db:dev:prepare`로 테스트 DB 스키마 준비
3. `npm run test:coverage`
4. 커버리지 레포트를 아티팩트로 업로드 (옵션)

Vitest는 Node 18+에 최적화되어 있으므로, CI 런타임 버전이 Next 요구사항(현재 18.18 이상)과 일치해야 한다.

---

## FAQ & 성장 노트

**Q1. 왜 Vitest인가요?**

- 빠른 HMR, Vite 생태계와의 통합, Web/Node 환경 전환이 쉬움.
- Jest와 API가 유사해 러닝커브가 낮고, `tsx`와 함께 쓰면 config-less 실행도 가능.

**Q2. Repository 테스트가 느릴까 걱정돼요.**

- 인메모리 SQLite는 ms 단위. 느리면 `beforeAll`에서 DB를 만들고 `afterEach`에서 `DELETE FROM`만 실행해 재사용.
- 테스트끼리 데이터가 섞이면 트랜잭션을 사용해 롤백하는 패턴도 좋다.

**Q3. Mocking이 어렵습니다.**

- `vi.fn()`으로 인터페이스를 만족시키는 객체를 직접 만들어라. 필요하면 `type RoundRepositoryMock = Mocked<RoundRepository>;` 선언.
- 더미 데이터를 만드는 `factory` 함수를 test utils로 분리하면 반복을 줄일 수 있다.

**Q4. 테스트 이름은 어떻게 짓나요?**

- “should ... when ...” 패턴 대신 “<기능> <기대 행동>” 형태로 한글/영문 상관없이 명확하게 작성. 예: `it('중복 시간대면 BusinessRuleError')`.

**성장 팁**

1. **Red → Green → Refactor** 루프를 습관화.
2. 테스트를 작성하기 전에 “이 시나리오가 실패하면 어떤 일이 벌어지는가”를 글로 적어본다.
3. 도메인 문서(docs/ehdnd/\*)와 테스트를 항상 함께 업데이트한다. 문서가 테스트 케이스의 출처가 되도록 한다.
4. 실패 로그를 의도적으로 읽고, 어떤 assertion이 왜 실패했는지 바로 설명할 수 있는지 점검한다.

이 가이드는 앞으로 DELTAX의 테스트 문화를 만들어 가기 위한 출발점이다. 한 번에 완벽할 필요는 없지만, “서비스 테스트 -> 레포 통합 테스트 -> 컨트롤러 계약 테스트 -> Postman 스모크” 순서를 반복하며 자신만의 루틴을 만들면 성장 속도가 크게 빨라진다. 필요할 때마다 이 문서를 업데이트하고, 새로 배운 패턴은 `docs/ehdnd`에 기록해 팀의 집단지성을 키워가자.
