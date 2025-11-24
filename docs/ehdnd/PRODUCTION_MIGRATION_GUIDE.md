# 운영 환경 데이터베이스 Migration 가이드

> **핵심**: 운영 DB는 **데이터가 있는 상태**이며, **서비스가 실행 중**이므로 migration은 신중하고 단계적으로 진행해야 합니다.

---

## 📋 목차

1. [Migration의 기본 원칙](#migration의-기본-원칙)
2. [Drizzle: generate vs push](#drizzle-generate-vs-push)
3. [Cloudflare D1 환경 특수사항](#cloudflare-d1-환경-특수사항)
4. [운영 환경 Migration Workflow](#운영-환경-migration-workflow)
5. [Zero-Downtime Migration 전략](#zero-downtime-migration-전략)
6. [위험한 작업들 & Rollback 불가능한 경우](#위험한-작업들--rollback-불가능한-경우)
7. [상황별 대응 전략](#상황별-대응-전략)
8. [체크리스트](#체크리스트)

---

## Migration의 기본 원칙

### 황금률

```
1. 운영 DB를 변경하기 전 ALWAYS 백업
2. 스테이징 환경에서 ALWAYS 먼저 테스트
3. Migration은 작고 원자적(atomic)으로
4. 절대 이미 적용된 migration 파일을 수정하지 말 것
5. 롤백 계획을 ALWAYS 세울 것 (하지만 롤백이 불가능한 경우도 있음을 인지)
```

### Migration이 해결할 수 있는 것 vs 없는 것

| Migration으로 **가능**                                  | Migration으로 **불가능/위험**                                  |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| ✅ 테이블/컬럼 추가                                     | ❌ 데이터 손실 없이 컬럼/테이블 삭제 (데이터가 이미 있는 경우) |
| ✅ NULL 가능 컬럼 추가                                  | ❌ NOT NULL 컬럼을 기존 데이터에 추가 (DEFAULT 없이)           |
| ✅ 인덱스 추가                                          | ⚠️ 대용량 테이블에 인덱스 추가 (lock 발생)                     |
| ✅ 외래키 추가                                          | ⚠️ 데이터 타입 변경 (호환성 문제)                              |
| ✅ 기존 컬럼 타입 확장 (예: VARCHAR(50) → VARCHAR(100)) | ❌ 롤백 시 데이터 손실 (예: 새 컬럼에 데이터가 쓰인 후 롤백)   |

---

## Drizzle: generate vs push

### `drizzle-kit push`

**무엇을 하는가:**

- 스키마를 DB와 직접 동기화
- SQL 파일 생성 **없음**
- DB를 introspect하여 현재 스키마와 비교 후 즉시 적용

**언제 사용:**

- ✅ **로컬 개발** (빠른 프로토타이핑)
- ✅ **Database branching 서비스** 사용 시 (PlanetScale, Neon, Supabase)
- ❌ **운영 환경** - 권장하지 않음

**위험:**

- Migration history가 없음
- 변경사항 리뷰 불가
- 롤백이 매우 어려움

```bash
# 로컬 개발용
npx drizzle-kit push
```

### `drizzle-kit generate` + `migrate`

**무엇을 하는가:**

- TypeScript 스키마 → SQL migration 파일 생성
- 버전 관리 가능한 `.sql` 파일 생성
- `drizzle/meta/_journal.json`에 migration history 기록

**언제 사용:**

- ✅ **운영 환경** (필수)
- ✅ 팀 협업
- ✅ 변경사항 리뷰 필요 시
- ✅ 점진적 배포 필요 시

**장점:**

- Git으로 버전 관리
- PR에서 SQL 변경사항 리뷰 가능
- Migration 순서 보장
- 롤백 가능 (단, 데이터 손실 위험 있음)

```bash
# 1. Migration 파일 생성
npm run db:generate
# → drizzle/0001_xxx.sql 생성

# 2. 생성된 SQL 파일 검토
cat drizzle/0001_xxx.sql

# 3. 운영 환경에 적용 (Cloudflare D1의 경우)
wrangler d1 migrations apply my-db-name --remote
```

---

## Cloudflare D1 환경 특수사항

### D1의 제약사항

1. **D1은 Cloudflare Worker에서만 접근 가능**
   - Drizzle의 `migrate()` API를 직접 사용하기 어려움
   - Wrangler CLI를 통해 migration 적용

2. **Migration tracking 방식**
   - Wrangler는 자체 migration tracking 사용
   - `wrangler.toml`에 설정 필요

3. **Transactional DDL 제한**
   - SQLite 기반이지만 일부 제약 있음
   - Migration 중 실패 시 부분 적용 가능성

### 권장 설정: `wrangler.toml`

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-db-name"
database_id = "a0637bbd-181c-4c6e-b52d-85557e3a1e1c"
# Drizzle이 생성한 migration 폴더 지정
migrations_dir = "drizzle"
# Migration tracking 테이블 이름 (선택사항)
migrations_table = "__d1_migrations"
```

### Cloudflare D1 Migration Workflow

```bash
# 1. 스키마 수정 (db/schema/*.ts)

# 2. Migration 파일 생성
npm run db:generate
# → drizzle/0001_xxx.sql 생성

# 3. 로컬에서 먼저 테스트
npm run db:migrate:local

# 4. 로컬 앱 실행해서 동작 확인
npm run dev

# 5. 생성된 migration 파일 검토
cat drizzle/0001_xxx.sql

# 6. Git commit
git add drizzle/
git commit -m "feat: add user profile columns"

# 7. 운영 환경 적용
wrangler d1 migrations apply my-db-name --remote

# 또는 list로 확인 후 적용
wrangler d1 migrations list my-db-name --remote
```

### D1 HTTP API 사용 (선택사항)

**장점:** Drizzle Kit이 직접 D1에 접근 가능

**설정:**

`drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http', // HTTP API 사용
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!, // D1 Edit 권한 필요
  },
});
```

**사용:**

```bash
# D1 HTTP API로 직접 migration
npx drizzle-kit migrate
npx drizzle-kit push  # 주의: 운영에서는 비추천
npx drizzle-kit studio  # DB 브라우저
```

---

## 운영 환경 Migration Workflow

### Step-by-Step 프로세스

#### Phase 1: 준비 단계

```bash
# 1. 현재 운영 DB 백업 (필수!)
wrangler d1 export my-db-name --remote --output=backup-$(date +%Y%m%d-%H%M%S).sql

# 2. 브랜치 생성
git checkout -b feat/add-user-profile-columns

# 3. 스키마 수정
# db/schema/users.ts 파일 수정
```

#### Phase 2: Migration 파일 생성

```bash
# 4. Migration 파일 생성
npm run db:generate

# 5. 생성된 SQL 확인
ls -la drizzle/
cat drizzle/0001_*.sql

# ⚠️ 생성된 SQL이 의도한 변경사항과 일치하는지 반드시 확인!
```

**확인 사항:**

- [ ] 불필요한 DROP 문이 없는가?
- [ ] DEFAULT 값이 올바른가?
- [ ] NOT NULL 제약이 기존 데이터와 충돌하지 않는가?
- [ ] 인덱스 생성이 필요한가?

#### Phase 3: 로컬 테스트

```bash
# 6. 로컬 D1 상태 초기화 (선택)
rm -rf .wrangler/state/**/d1/*

# 7. 로컬 D1에 migration 적용
wrangler d1 migrations apply DB --local

# 8. 앱 실행 및 테스트
npm run dev

# 9. 모든 기능이 정상 동작하는지 확인
# - 기존 데이터 읽기
# - 새 데이터 쓰기
# - API 엔드포인트 테스트
```

#### Phase 4: 스테이징 테스트 (선택사항이지만 강력 권장)

```bash
# 10. 스테이징 DB에 적용 (있는 경우)
wrangler d1 migrations apply my-db-name-staging --remote

# 11. 스테이징 앱 배포
npm run build
wrangler pages deploy --env staging

# 12. 스테이징에서 통합 테스트
# - 실제 데이터와 유사한 테스트 데이터로 확인
# - 부하 테스트 (대용량 데이터 시)
```

#### Phase 5: 코드 리뷰 & 승인

```bash
# 13. Git commit & push
git add .
git commit -m "feat: add user profile columns for personalization"
git push origin feat/add-user-profile-columns

# 14. Pull Request 생성
# PR 설명에 다음 포함:
# - 변경 이유
# - Migration SQL 내용
# - 롤백 계획
# - 테스트 결과
```

**PR 리뷰 체크리스트:**

- [ ] Migration SQL이 의도대로 작성되었는가?
- [ ] Breaking changes가 있는가?
- [ ] Zero-downtime으로 배포 가능한가?
- [ ] 롤백 시 데이터 손실 가능성은?

#### Phase 6: 운영 배포

```bash
# 15. 운영 DB 최종 백업
wrangler d1 export my-db-name --remote --output=prod-backup-before-migration-$(date +%Y%m%d-%H%M%S).sql

# 16. 적용될 migration 확인
wrangler d1 migrations list my-db-name --remote

# 17. Migration 적용
wrangler d1 migrations apply my-db-name --remote

# 18. Migration 적용 결과 확인
# - 에러 로그 확인
# - 테이블 스키마 확인

# 19. 앱 배포
npm run build
wrangler pages deploy

# 20. 모니터링
# - 에러 로그 확인
# - 성능 모니터링
# - 사용자 피드백 확인
```

#### Phase 7: 롤백 (필요 시)

```bash
# ⚠️ 주의: 롤백은 데이터 손실 가능성이 있음!

# Option A: 앱만 롤백 (DB는 유지)
# - 새 컬럼에 데이터가 쓰이지 않았다면 안전
wrangler pages rollback

# Option B: DB도 롤백 (위험!)
# - 백업에서 복원 (새로 쓰인 데이터는 손실됨)
wrangler d1 execute my-db-name --remote --file=prod-backup-before-migration-*.sql

# Option C: Fix-forward (권장)
# - 새 migration 작성하여 문제 수정
npm run db:generate
wrangler d1 migrations apply my-db-name --remote
```

---

## Zero-Downtime Migration 전략

### Expand and Contract Pattern

**핵심 아이디어**: 한 번에 바꾸지 말고, 3단계로 나누어 배포

#### 예시: 컬럼 이름 변경 (user_name → full_name)

##### ❌ 잘못된 방법 (Downtime 발생)

```sql
-- Migration 1 (WRONG!)
ALTER TABLE users RENAME COLUMN user_name TO full_name;
```

```typescript
// 앱 배포 (WRONG!)
const user = await db.select({ fullName: users.full_name });
```

**문제:**

- Migration 적용 → 배포 사이에 `user_name` 컬럼이 없어서 에러
- 배포 → Migration 적용 사이에 `full_name` 컬럼이 없어서 에러
- 롤백 시 데이터 손실

##### ✅ 올바른 방법 (Zero-Downtime)

**Phase 1: Expand (확장)**

```sql
-- Migration 1: 새 컬럼 추가 (NULL 허용)
ALTER TABLE users ADD COLUMN full_name TEXT;
```

```typescript
// 앱 배포 1: 양쪽 모두 읽고 쓰기
export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  userName: text('user_name'), // 기존 (읽기용)
  fullName: text('full_name'), // 신규 (읽기+쓰기)
});

// 앱 로직
async function createUser(name: string) {
  await db.insert(usersTable).values({
    id: generateId(),
    userName: name, // 기존 컬럼에도 쓰기 (backward compatibility)
    fullName: name, // 새 컬럼에 쓰기
  });
}

async function getUser(id: string) {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, id));
  // 새 컬럼 우선, 없으면 기존 컬럼
  return user.fullName || user.userName;
}
```

**Phase 2: Migrate Data (데이터 마이그레이션)**

```sql
-- Migration 2: 기존 데이터 복사 (별도 배포 또는 스크립트)
UPDATE users SET full_name = user_name WHERE full_name IS NULL;
```

또는 애플리케이션 레벨에서:

```typescript
// 일회성 마이그레이션 스크립트
async function migrateUserNames() {
  const usersWithoutFullName = await db
    .select()
    .from(usersTable)
    .where(isNull(usersTable.fullName));

  for (const user of usersWithoutFullName) {
    await db.update(usersTable).set({ fullName: user.userName }).where(eq(usersTable.id, user.id));
  }
}
```

**Phase 3: Contract (축소)**

```sql
-- Migration 3: 기존 컬럼 삭제
ALTER TABLE users DROP COLUMN user_name;

-- 필요 시 NOT NULL 제약 추가
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;
```

```typescript
// 앱 배포 3: 새 컬럼만 사용
export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(), // 신규만 사용
});
```

### 다른 일반적인 시나리오

#### 1. 새 NOT NULL 컬럼 추가

**잘못된 방법:**

```sql
ALTER TABLE users ADD COLUMN email TEXT NOT NULL;  -- ❌ 기존 row에 에러!
```

**올바른 방법:**

```sql
-- Step 1: NULL 허용으로 추가
ALTER TABLE users ADD COLUMN email TEXT;

-- Step 2: 앱에서 기존 사용자에게 이메일 입력 받기
-- 또는 기본값으로 채우기
UPDATE users SET email = 'default@example.com' WHERE email IS NULL;

-- Step 3: NOT NULL 제약 추가
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
```

#### 2. 테이블 삭제

**올바른 방법:**

```sql
-- Step 1: 앱에서 해당 테이블 사용하는 코드 제거 → 배포

-- Step 2: 일정 시간 대기 (롤백 가능 기간)

-- Step 3: 테이블 rename (삭제 대신)
ALTER TABLE old_table RENAME TO old_table_deprecated_20250118;

-- Step 4: 모니터링 (문제 없으면)

-- Step 5: 최종 삭제
DROP TABLE old_table_deprecated_20250118;
```

#### 3. 외래키 추가 (대용량 테이블)

```sql
-- Step 1: 인덱스 먼저 추가 (lock 최소화)
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Step 2: 데이터 정합성 확인
SELECT COUNT(*) FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL;
-- → 0이어야 함

-- Step 3: 외래키 추가
ALTER TABLE orders
ADD CONSTRAINT fk_orders_user
FOREIGN KEY (user_id) REFERENCES users(id);
```

---

## 위험한 작업들 & Rollback 불가능한 경우

### 🔴 절대 롤백 불가능한 작업

| 작업                       | 위험도 | 이유                  | 대안                        |
| -------------------------- | ------ | --------------------- | --------------------------- |
| `DROP TABLE`               | 🔴🔴🔴 | 데이터 영구 손실      | Rename → 대기 → 삭제        |
| `DROP COLUMN`              | 🔴🔴🔴 | 컬럼 데이터 영구 손실 | Ignore → 대기 → 삭제        |
| `ALTER COLUMN TYPE` (축소) | 🔴🔴   | 데이터 손실/변환 실패 | 새 컬럼 추가 → 마이그레이션 |
| `TRUNCATE TABLE`           | 🔴🔴🔴 | 모든 데이터 삭제      | 절대 운영에서 사용 금지     |

### 🟡 조건부 위험한 작업

#### 1. 인덱스 추가 (대용량 테이블)

**문제:**

- PostgreSQL: 테이블 lock → 읽기/쓰기 차단
- MySQL: Online DDL이지만 시간이 오래 걸림

**해결:**

```sql
-- PostgreSQL
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);

-- MySQL
ALTER TABLE users ADD INDEX idx_email(email), ALGORITHM=INPLACE, LOCK=NONE;
```

#### 2. NOT NULL 제약 추가

**문제:**

- 기존 NULL 값이 있으면 실패

**해결:**

```sql
-- Step 1: NULL 체크
SELECT COUNT(*) FROM users WHERE email IS NULL;

-- Step 2: NULL 값 처리
UPDATE users SET email = 'default@example.com' WHERE email IS NULL;

-- Step 3: NOT NULL 추가
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
```

#### 3. 기본값(DEFAULT) 추가

**PostgreSQL 11+:**

```sql
-- 빠름: metadata만 변경
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
```

**PostgreSQL 10 이하, MySQL:**

```sql
-- 느림: 모든 row 업데이트
ALTER TABLE users ADD COLUMN status TEXT;
-- 대용량이면 batch update
UPDATE users SET status = 'active' WHERE status IS NULL;
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active';
```

### 🟢 안전한 작업

- 새 테이블 추가
- 새 컬럼 추가 (NULL 허용)
- 인덱스 삭제
- 컬럼 타입 확장 (VARCHAR(50) → VARCHAR(100))

### Rollback의 현실

**진실:**

> "Database rollback은 이론적으로는 가능하지만, 실전에서는 거의 불가능하다."

**이유:**

1. **데이터가 이미 변경됨**

   ```
   Migration 적용 → 새 컬럼에 데이터 쓰기 → 롤백 → 데이터 손실!
   ```

2. **Down migration은 환상**
   - Up migration: `ADD COLUMN email`
   - Down migration: `DROP COLUMN email`
   - 문제: 롤백 시 `email` 데이터가 영구 손실

3. **부분 적용 (Partial Migration)**
   - MySQL: 트랜잭션 DDL 미지원
   - Migration 중간에 실패 → 일부만 적용된 상태
   - 수동으로 정리 필요

**권장 방법: Fix-Forward**

롤백 대신, 문제를 해결하는 새 migration 작성:

```bash
# 잘못된 migration 0005가 적용됨
# ❌ 롤백 시도하지 말 것

# ✅ 문제를 수정하는 새 migration 작성
npm run db:generate  # 0006 생성
wrangler d1 migrations apply my-db-name --remote
```

---

## 상황별 대응 전략

### 1. 단순 스키마 변경 (컬럼 추가/삭제)

**시나리오:** 새 기능을 위한 컬럼 추가

**전략:**

```bash
1. db:generate → migration 파일 생성
2. 로컬 테스트
3. 스테이징 테스트
4. 운영 배포
```

**난이도:** 🟢 쉬움

---

### 2. 대규모 스키마 변경 (테이블 구조 변경)

**시나리오:** 테이블 정규화, 관계 변경

**전략:**

- Expand and Contract 사용
- 3단계 배포 (확장 → 마이그레이션 → 축소)

**난이도:** 🟡 중간

---

### 3. 데이터 마이그레이션 필요 (값 변환)

**시나리오:** `status` 컬럼 타입 변경 (TEXT → INTEGER enum)

**전략:**

```sql
-- Migration 1: 새 컬럼 추가
ALTER TABLE rounds ADD COLUMN status_v2 INTEGER;

-- Migration 2: 데이터 변환 (애플리케이션 또는 SQL)
-- 'SCHEDULED' → 1, 'ACTIVE' → 2, etc.
```

```typescript
// 변환 스크립트
async function migrateStatus() {
  const statusMap = {
    SCHEDULED: 1,
    ACTIVE: 2,
    ENDED: 3,
  };

  const rounds = await db.select().from(roundsTable);
  for (const round of rounds) {
    await db
      .update(roundsTable)
      .set({ statusV2: statusMap[round.status] })
      .where(eq(roundsTable.id, round.id));
  }
}
```

```sql
-- Migration 3: 기존 컬럼 삭제
ALTER TABLE rounds DROP COLUMN status;
ALTER TABLE rounds RENAME COLUMN status_v2 TO status;
```

**난이도:** 🔴 어려움

---

### 4. 대용량 데이터 처리 (수백만 row)

**시나리오:** 1000만 row 테이블에 인덱스 추가

**전략:**

```sql
-- PostgreSQL: CONCURRENTLY 사용 (lock 없음)
CREATE INDEX CONCURRENTLY idx_huge_table_created_at
ON huge_table(created_at);

-- 실패 시 INVALID 인덱스 정리
DROP INDEX CONCURRENTLY IF EXISTS idx_huge_table_created_at;
```

**주의:**

- `CONCURRENTLY`는 시간이 더 오래 걸림
- 실패 시 수동으로 정리 필요
- 모니터링 필수

**난이도:** 🔴 어려움

---

### 5. Breaking Change (기존 컬럼 삭제/변경)

**시나리오:** 더 이상 사용하지 않는 컬럼 제거

**전략: 4단계 배포**

```
Week 1: 앱에서 해당 컬럼 사용 중단 → 배포
Week 2: 모니터링 (실제로 안 쓰이는지 확인)
Week 3: 컬럼 rename (soft delete)
Week 4: 최종 삭제
```

**난이도:** 🟡 중간

---

### 6. 스키마 변경 없이 데이터만 수정

**시나리오:** 잘못된 데이터 일괄 수정

**전략:**

```typescript
// Migration 파일이 아닌 별도 스크립트
// scripts/fix-data.ts
import { db } from './db';

async function fixData() {
  // Dry-run 먼저
  const affected = await db.select().from(usersTable).where(eq(usersTable.delBalance, -1));

  console.log(`Will affect ${affected.length} rows`);

  // 확인 후 실행
  if (process.env.CONFIRM === 'yes') {
    await db.update(usersTable).set({ delBalance: 0 }).where(eq(usersTable.delBalance, -1));
  }
}

fixData();
```

**실행:**

```bash
# Dry-run
node scripts/fix-data.ts

# 실행
CONFIRM=yes node scripts/fix-data.ts
```

**난이도:** 🟡 중간

---

### 7. Migration이 아닌 다른 방법이 필요한 경우

#### Case A: 대규모 데이터 변환

**문제:** Migration으로는 너무 느림 (수시간 소요)

**해결:**

1. **Blue-Green Deployment**
   - 새 DB 생성 → 데이터 복제 → 전환

2. **점진적 마이그레이션**

   ```typescript
   // 백그라운드 작업으로 조금씩 마이그레이션
   async function migrateInBackground() {
     const BATCH_SIZE = 1000;
     while (true) {
       const batch = await db
         .select()
         .from(oldTable)
         .where(isNull(oldTable.migrated))
         .limit(BATCH_SIZE);

       if (batch.length === 0) break;

       // 변환 및 새 테이블에 삽입
       await transformAndInsert(batch);

       // 처리됨 표시
       await db
         .update(oldTable)
         .set({ migrated: true })
         .where(
           inArray(
             oldTable.id,
             batch.map((r) => r.id),
           ),
         );

       // 과부하 방지
       await sleep(100);
     }
   }
   ```

#### Case B: 완전히 다른 DB로 이전

**문제:** SQLite → PostgreSQL, 또는 다른 서비스로 이전

**해결:**

- ETL 파이프라인 구축
- AWS DMS, Airbyte 등 도구 사용
- Replication 설정 → 동기화 → 전환

#### Case C: 스키마 변경이 불가능한 경우

**문제:** Managed service의 제약, 권한 부족

**해결:**

- 애플리케이션 레벨에서 해결
- View 생성
- Virtual column 사용

---

## 체크리스트

### 배포 전 체크리스트

- [ ] 운영 DB 백업 완료
- [ ] 생성된 migration SQL 파일 검토 완료
- [ ] 위험한 작업(DROP, ALTER TYPE 등) 없는지 확인
- [ ] 로컬 환경에서 테스트 완료
- [ ] 스테이징 환경에서 테스트 완료 (있는 경우)
- [ ] 롤백 계획 수립 (또는 fix-forward 전략)
- [ ] Zero-downtime 전략 적용 (breaking change인 경우)
- [ ] PR 리뷰 완료
- [ ] 모니터링 준비 (에러 알림, 로그)

### 배포 중 체크리스트

- [ ] 최종 백업 생성
- [ ] Migration 적용 전 list 확인
- [ ] Migration 적용
- [ ] 에러 로그 확인
- [ ] 앱 배포
- [ ] Health check 통과
- [ ] 주요 기능 동작 확인

### 배포 후 체크리스트

- [ ] 에러 로그 모니터링 (1시간)
- [ ] 성능 메트릭 확인
- [ ] 사용자 피드백 확인
- [ ] 데이터 정합성 확인
- [ ] 롤백 준비 상태 유지 (24시간)

---

## 추가 리소스

### Drizzle ORM 공식 문서

- [Migrations](https://orm.drizzle.team/docs/migrations)
- [drizzle-kit push](https://orm.drizzle.team/docs/drizzle-kit-push)
- [Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)

### Cloudflare D1 문서

- [D1 Migrations](https://developers.cloudflare.com/d1/build-with-d1/migrations/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/commands/#d1)

### 일반 Migration 베스트 프랙티스

- [Expand and Contract Pattern](https://www.cockroachlabs.com/blog/how-to-update-database-schema/)
- [Zero Downtime Deployment](https://spring.io/blog/2016/05/31/zero-downtime-deployment-with-a-database/)

---

## 결론

**핵심 원칙:**

1. **운영 DB는 신중하게**
   - 백업 필수
   - 테스트 필수
   - 점진적 배포

2. **generate + migrate를 사용**
   - push는 로컬 개발용
   - Migration 파일로 버전 관리

3. **Zero-downtime 전략 적용**
   - Expand and Contract
   - Backward compatibility

4. **롤백보다 Fix-forward**
   - 롤백은 환상
   - 새 migration으로 수정

5. **모니터링과 대응 준비**
   - 문제 발생 시 빠른 대응
   - 롤백 계획 (하지만 데이터 손실 각오)

**마지막 조언:**

> "완벽한 migration 전략은 없다. 하지만 신중한 계획과 테스트, 그리고 빠른 대응 능력이 있다면 대부분의 문제는 해결할 수 있다."

운영 DB migration은 **엔지니어링의 예술**입니다. 기술적 지식뿐만 아니라 경험과 직관이 필요합니다. 처음에는 어렵지만, 몇 번 경험하면 자신감이 생깁니다.

**화이팅!** 🚀
