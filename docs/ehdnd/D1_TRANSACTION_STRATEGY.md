# Cloudflare D1 vs Local SQLite 트랜잭션 전략

**작성일**: 2025-11-19  
**대상**: DELTAX 백엔드 개발자  
**목적**: Cloudflare D1(배포 환경)과 better-sqlite3(로컬 개발 환경)의 트랜잭션 처리 방식 차이를 이해하고, 이를 해결하기 위한 아키텍처 전략을 정의함.

---

## 📋 목차

1. [배경 및 문제 상황](#1-배경-및-문제-상황)
2. [기술적 제약 분석](#2-기술적-제약-분석)
3. [의사결정: 어댑터 패턴을 통한 분기](#3-의사결정-어댑터-패턴을-통한-분기)
4. [구현 가이드](#4-구현-가이드)
5. [향후 대응 전략](#5-향후-대응-전략)

---

## 1. 배경 및 문제 상황

### 1.1 개발 환경의 차이

- **Local (Dev)**: `npm run dev` 실행 시, `better-sqlite3` 드라이버를 통해 로컬 파일 DB(`delta.db`)에 동기적으로 접속합니다. 빠른 개발 루프와 디버깅이 장점입니다.
- **Production (D1)**: Cloudflare Workers 환경에서는 `drizzle-orm/d1` 어댑터를 통해 D1 데이터베이스에 비동기(HTTP)로 접속합니다.

### 1.2 문제 발생

`BetRepository.create` 메서드에서 원자성(Atomicity) 보장을 위해 `db.batch()`를 사용했습니다.

```typescript
// 배포 환경 (D1) - 성공
await db.batch([insertQuery, updateQuery]);

// 로컬 환경 (Local) - 실패
// TypeError: db.batch is not a function
```

`better-sqlite3` 드라이버는 `db.batch()` 메서드를 지원하지 않으며, 대신 `db.transaction()`을 사용해야 합니다. 반대로 D1 드라이버는 Interactive Transaction(`BEGIN`...`COMMIT`)을 지원하지 않고 `db.batch()`만 지원합니다.

---

## 2. 기술적 제약 분석

| 기능               | Cloudflare D1              | Local SQLite (better-sqlite3)         |
| :----------------- | :------------------------- | :------------------------------------ |
| **통신 방식**      | HTTP (비동기)              | In-Process / File (동기)              |
| **트랜잭션**       | `db.batch([...])`만 지원   | `db.transaction(cb)` 지원             |
| **Interactive Tx** | ❌ 불가능 (로직 섞기 불가) | ✅ 가능 (중간 로직 허용)              |
| **테스트 환경**    | `wrangler dev` 필요        | `vitest` (Node.js)에서 바로 실행 가능 |

### 2.1 딜레마

- D1의 `batch`는 미리 만들어진 SQL 배열을 한 번에 보내는 방식입니다.
- Local의 `transaction`은 콜백 함수 내에서 순차적으로 실행하는 방식입니다.
- Drizzle ORM 쿼리 빌더 객체(`db.insert(...)`)는 생성 시점의 `db` 인스턴스에 바인딩되므로, 로컬 트랜잭션 내부(`tx`)로 옮겨 실행하기가 까다롭습니다.

---

## 3. 의사결정: 어댑터 패턴을 통한 분기

우리의 목표는 **"로컬 개발 속도를 저하시키지 않으면서(npm run dev 유지), 배포 환경의 안정성을 보장하는 것"**입니다.

따라서 **Repository Layer에서 환경을 감지하고 코드를 분기하는 전략**을 채택합니다.

### 3.1 결정된 전략

1. `db` 객체에 `batch` 메서드가 있는지 확인하여 환경을 판별합니다.
2. **D1 환경**이면 `db.batch()`를 사용하여 쿼리 배열을 전송합니다.
3. **Local 환경**이면 `db.transaction()`을 열고, 내부에서 `tx` 객체를 사용해 동일한 로직을 수행합니다.
4. 두 실행 경로의 **반환 값 포맷을 통일**하여 Service Layer가 차이를 모르게 합니다.

---

## 4. 구현 가이드

### 4.1 Helper 함수 사용 (Repository 내부)

```typescript
// lib/bets/repository.ts

private isD1(db: any): boolean {
  return typeof db.batch === 'function';
}

async create(input: CreateBetInput) {
  const db = getDb();

  if (this.isD1(db)) {
    // 🚀 [Production] D1 Batch Execution
    // 쿼리 객체를 배열로 전달
    const results = await db.batch([
      db.insert(bets).values(...).returning(),
      db.update(rounds).set(...).returning(),
      // ...
    ]);
    return this.normalizeResult(results);
  } else {
    // 💻 [Local] Interactive Transaction
    // 콜백 내부에서 순차 실행
    return await db.transaction(async (tx) => {
      const bet = await tx.insert(bets).values(...).returning();
      const round = await tx.update(rounds).set(...).returning();
      // ...
      return this.normalizeResult([bet, round]);
    });
  }
}
```

### 4.2 주의사항

- **로직 일치**: 분기된 두 코드 블록은 **완전히 동일한 데이터 조작**을 수행해야 합니다. 로직 수정 시 두 곳 모두 업데이트해야 합니다.
- **쿼리 객체 재사용 금지**: `const query = db.insert(...)` 처럼 쿼리를 변수에 담아두고 재사용하면 안 됩니다. `db`와 `tx`는 서로 다른 세션입니다.

---

## 5. 향후 대응 전략

### 5.1 비슷한 문제가 발생할 경우

1. **D1 전용 기능 사용 시**: `batch` 외에도 D1 전용 기능(예: `returning` 동작 차이 등)이 발견되면, 위와 같이 Repository 레벨에서 추상화하여 격리합니다.
2. **테스트 환경**: `Vitest`는 로컬 환경(Node.js)에서 돌기 때문에 `better-sqlite3` 로직을 탑니다. 따라서 로컬 트랜잭션 로직이 테스트 커버리지에 포함됩니다. 배포 전 `wrangler`를 통한 스테이징 테스트가 권장됩니다.

### 5.2 장기적인 개선 (Optional)

프로젝트 규모가 커지면 다음 방법을 고려할 수 있습니다:

- **로컬 D1 에뮬레이션 강제**: 팀 전체가 `wrangler dev`만 사용하도록 컨벤션을 변경 (속도 희생, 환경 일치 최우선).
- **Custom DB Client Wrapper**: `db.batchOrTransaction([...])` 같은 커스텀 메서드를 만들어 라이브러리화.

하지만 현재 단계에서는 **조건부 분기(if-else)**가 가장 가성비 좋고 명확한 해결책입니다.
