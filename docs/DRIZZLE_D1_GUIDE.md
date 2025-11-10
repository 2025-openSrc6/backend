# Drizzle ORM과 Cloudflare D1 사용 가이드

이 문서는 DeltaX 프로젝트에서 Cloudflare D1 데이터베이스와 Drizzle ORM을 함께 사용하는 방법을 설명합니다.

---

## 📚 목차

1. [기본 개념](#기본-개념)
2. [프로젝트 구조](#프로젝트-구조)
3. [API에서 사용하기](#api에서-사용하기)
4. [주요 쿼리 예제](#주요-쿼리-예제)
5. [마이그레이션 관리](#마이그레이션-관리)
6. [자주 묻는 질문](#자주-묻는-질문)

---

## 기본 개념

### Drizzle ORM이란?

**Drizzle**은 TypeScript/JavaScript용 경량 ORM(Object-Relational Mapping)으로:
- 타입 안전성을 제공합니다
- SQL과 유사한 문법으로 직관적입니다
- Cloudflare D1을 완벽하게 지원합니다

### Cloudflare D1이란?

**D1**은 Cloudflare가 제공하는 서버리스 SQLite 데이터베이스로:
- 복잡한 설정 없이 바로 사용 가능
- 에지 네트워크에 배포되어 빠른 응답 속도
- Wrangler CLI로 쉽게 관리

---

## 프로젝트 구조

```
backend/
├── db/
│   ├── client.ts          ← Drizzle 클라이언트 설정
│   ├── schema/
│   │   └── index.ts       ← 테이블 스키마 정의
│   └── d1-client.ts       ← D1 전용 클라이언트
├── lib/
│   ├── db.ts              ← getDbFromContext() 유틸
│   └── types.ts           ← 환경 변수 타입
├── app/api/
│   ├── rounds/
│   │   └── route.ts       ← 라운드 API
│   └── bets/
│       └── route.ts       ← 베팅 API
├── drizzle.config.ts      ← Drizzle 설정
├── wrangler.toml          ← Cloudflare 설정
└── package.json
```

---

## API에서 사용하기

### 기본 패턴

```typescript
import { getDbFromContext } from "@/lib/db";
import { rounds } from "@/db/schema";

export async function GET(request: Request, context: any) {
  try {
    // 1. DB 클라이언트 초기화
    const db = getDbFromContext(context);

    // 2. Drizzle을 사용해서 쿼리 작성
    const data = await db.select().from(rounds);

    // 3. 응답 반환
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### getDbFromContext()란?

`lib/db.ts`에서 제공하는 함수로, API 요청 컨텍스트에서 D1 바인딩을 추출해 Drizzle 클라이언트를 생성합니다.

```typescript
// API 라우트에서 항상 이렇게 사용합니다
const db = getDbFromContext(context);
```

---

## 주요 쿼리 예제

### 1️⃣ SELECT (조회)

```typescript
const db = getDbFromContext(context);

// 모든 라운드 조회
const allRounds = await db.select().from(rounds);

// 조건으로 조회
import { eq } from "drizzle-orm";
const activeRounds = await db
  .select()
  .from(rounds)
  .where(eq(rounds.status, "active"));

// 특정 ID로 조회
const round = await db
  .select()
  .from(rounds)
  .where(eq(rounds.id, 1))
  .limit(1);
```

### 2️⃣ INSERT (삽입)

```typescript
import { NewRound } from "@/db/schema";

const newData: NewRound = {
  roundKey: "round_001",
  timeframe: "1h",
  lockingStartsAt: Date.now(),
  lockingEndsAt: Date.now() + 3600000,
};

const result = await db
  .insert(rounds)
  .values(newData)
  .returning();

console.log("생성된 라운드:", result[0]);
```

### 3️⃣ UPDATE (수정)

```typescript
import { eq } from "drizzle-orm";

const updated = await db
  .update(rounds)
  .set({
    status: "settled",
    settledAt: Date.now()
  })
  .where(eq(rounds.id, 1))
  .returning();
```

### 4️⃣ DELETE (삭제)

```typescript
import { eq } from "drizzle-orm";

const deleted = await db
  .delete(bets)
  .where(eq(bets.roundId, 1))
  .returning();
```

### 5️⃣ 조인 (JOIN)

```typescript
import { eq } from "drizzle-orm";

const roundWithBets = await db
  .select()
  .from(rounds)
  .leftJoin(bets, eq(rounds.id, bets.roundId))
  .where(eq(rounds.id, 1));
```

---

## 마이그레이션 관리

### 스키마 변경 후 마이그레이션 생성

`db/schema/index.ts`에서 테이블 또는 컬럼을 변경한 후:

```bash
npm run db:generate
```

이 명령어가 `drizzle/` 폴더에 SQL 마이그레이션 파일을 생성합니다.

### 마이그레이션 실행 (원격 D1에 적용)

```bash
npm run db:migrate
```

이 명령어가 생성된 SQL을 원격 Cloudflare D1에 적용합니다.

### 로컬에서 DB 확인

```bash
npm run db:studio
```

Drizzle Studio를 열어서 로컬 DB 상태를 확인할 수 있습니다.

---

## 실제 API 예제

### 라운드 조회 API

**파일: `/app/api/rounds/route.ts`**

```typescript
export async function GET(_request: Request, context: any) {
  try {
    const db = getDbFromContext(context);
    const allRounds = await db.select().from(rounds);

    return Response.json({
      success: true,
      data: allRounds,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**사용:**
```bash
curl http://localhost:3000/api/rounds
```

### 라운드 생성 API

```typescript
export async function POST(request: Request, context: any) {
  try {
    const body = await request.json();
    const db = getDbFromContext(context);

    const result = await db
      .insert(rounds)
      .values({
        roundKey: body.roundKey,
        timeframe: body.timeframe,
        lockingStartsAt: body.lockingStartsAt,
        lockingEndsAt: body.lockingEndsAt,
      })
      .returning();

    return Response.json(
      { success: true, data: result[0] },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**사용:**
```bash
curl -X POST http://localhost:3000/api/rounds \
  -H "Content-Type: application/json" \
  -d '{
    "roundKey": "round_001",
    "timeframe": "1h",
    "lockingStartsAt": 1731235200000,
    "lockingEndsAt": 1731238800000
  }'
```

### 베팅 조회 API (필터링)

```typescript
export async function GET(request: Request, context: any) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId");

    const db = getDbFromContext(context);

    let allBets;
    if (roundId) {
      allBets = await db
        .select()
        .from(bets)
        .where(eq(bets.roundId, parseInt(roundId)));
    } else {
      allBets = await db.select().from(bets);
    }

    return Response.json({ success: true, data: allBets });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**사용:**
```bash
# 특정 라운드의 베팅만 조회
curl http://localhost:3000/api/bets?roundId=1

# 모든 베팅 조회
curl http://localhost:3000/api/bets
```

---

## 자주 묻는 질문

### Q1. Drizzle과 D1은 호환되나요?

네, 완벽하게 호환됩니다. `drizzle-orm/d1` 패키지를 사용하면 D1에 최적화된 설정으로 사용할 수 있습니다.

### Q2. 타입 안전성은 어떻게 보장되나요?

Drizzle은 스키마 정의(`db/schema/index.ts`)를 기반으로 자동으로 타입을 생성합니다:

```typescript
import type { Round, Bet } from "@/db/schema";

const round: Round = /* 쿼리 결과 */;
const bet: Bet = /* 쿼리 결과 */;
```

### Q3. 새 테이블을 추가하려면?

1. `db/schema/index.ts`에 테이블 정의 추가
2. 관계(Relations) 정의
3. `npm run db:generate` 실행
4. `npm run db:migrate` 실행

### Q4. 쿼리가 복잡할 때는?

Drizzle은 복잡한 쿼리도 지원합니다:

```typescript
import { and, or, gte, lte } from "drizzle-orm";

const results = await db
  .select()
  .from(rounds)
  .where(
    and(
      eq(rounds.status, "active"),
      gte(rounds.createdAt, startDate),
      lte(rounds.createdAt, endDate)
    )
  );
```

### Q5. 에러가 발생했을 때는?

```typescript
try {
  const data = await db.select().from(rounds);
} catch (error) {
  console.error("DB Error:", error);
  // 에러 처리
}
```

---

## 참고 자료

- [Drizzle 공식 문서](https://orm.drizzle.team/)
- [Cloudflare D1 문서](https://developers.cloudflare.com/d1/)
- [프로젝트 README](../README.md)

---

**문제가 있으신가요?** `docs/` 폴더의 다른 가이드를 참고하거나 팀에 문의하세요.
