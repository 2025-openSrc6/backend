# Cloudflare D1 Database 사용 가이드

## 개요

이 프로젝트는 Cloudflare D1 (SQLite 기반) 데이터베이스를 사용합니다.

## 설정

### 로컬 개발

1. `.env.local` 파일 생성:
   ```bash
   cp .env.example .env.local
   ```

2. `.env.local`에 팀 리드에게서 받은 DB ID 추가:
   ```
   CLOUDFLARE_D1_ID=<YOUR_D1_ID>
   ```

   > ⚠️ `CLOUDFLARE_D1_ID`는 팀 리드에게 별도로 요청하세요.

### 배포

GitHub Secrets에 다음을 추가하세요:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_ID`

## API 라우트 사용 예제

### 1. 헬스 체크
```bash
curl http://localhost:3000/api/health
```

### 2. 모든 라운드 조회
```bash
curl http://localhost:3000/api/rounds
```

### 3. 새로운 라운드 생성
```bash
curl -X POST http://localhost:3000/api/rounds \
  -H "Content-Type: application/json" \
  -d '{
    "roundKey": "round-001",
    "timeframe": "1h",
    "status": "active",
    "lockingStartsAt": "2025-01-10T10:00:00Z",
    "lockingEndsAt": "2025-01-10T11:00:00Z"
  }'
```

### 4. 라운드별 베팅 조회
```bash
curl "http://localhost:3000/api/bets?roundId=1"
```

### 5. 새로운 베팅 생성
```bash
curl -X POST http://localhost:3000/api/bets \
  -H "Content-Type: application/json" \
  -d '{
    "roundId": 1,
    "walletAddress": "0x123...",
    "selection": "gold",
    "amount": "100.50",
    "txDigest": "tx123..."
  }'
```

## 라우트 구조

```
app/
├── api/
│   ├── health/
│   │   └── route.ts          # 헬스 체크
│   ├── rounds/
│   │   └── route.ts          # 라운드 CRUD
│   └── bets/
│       └── route.ts          # 베팅 CRUD
```

## DB 클라이언트 사용

API 라우트에서 DB를 사용하는 기본 패턴:

```typescript
import { getDbFromContext } from "@/lib/db";
import { rounds } from "@/db/schema";

export async function GET(request: Request, context: any) {
  try {
    const db = getDbFromContext(context);
    const allRounds = await db.select().from(rounds);

    return Response.json({
      success: true,
      data: allRounds,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
```

## Drizzle ORM 쿼리 예제

### SELECT
```typescript
// 모든 데이터 조회
const allRounds = await db.select().from(rounds);

// 조건부 조회
const activeRounds = await db
  .select()
  .from(rounds)
  .where(eq(rounds.status, "active"));

// 관계 포함 조회
const roundsWithBets = await db
  .select()
  .from(rounds)
  .leftJoin(bets, eq(rounds.id, bets.roundId));
```

### INSERT
```typescript
const newRound = await db
  .insert(rounds)
  .values({
    roundKey: "round-001",
    timeframe: "1h",
    status: "scheduled",
    lockingStartsAt: new Date(),
    lockingEndsAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .returning();
```

### UPDATE
```typescript
const updated = await db
  .update(rounds)
  .set({ status: "settled", updatedAt: new Date() })
  .where(eq(rounds.id, 1))
  .returning();
```

### DELETE
```typescript
await db
  .delete(rounds)
  .where(eq(rounds.id, 1));
```

## 마이그레이션

새로운 스키마 변경:

1. `db/schema/index.ts` 수정
2. 마이그레이션 파일 생성:
   ```bash
   npm run db:generate
   ```
3. 마이그레이션 적용:
   ```bash
   npx wrangler d1 execute deltax-db --remote --file=drizzle/[migration_file].sql
   ```

## 트러블슈팅

### "D1 database not available" 에러
- `.env.local` 파일이 존재하는지 확인
- `CLOUDFLARE_D1_ID`가 올바르게 설정되었는지 확인

### 마이그레이션 실패
- Cloudflare에 로그인되어 있는지 확인:
  ```bash
  npx wrangler whoami
  ```
- DB ID가 정확한지 확인

## 참고 자료

- [Drizzle ORM 공식 문서](https://orm.drizzle.team/)
- [Cloudflare D1 공식 문서](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers 공식 문서](https://developers.cloudflare.com/workers/)
