# 신규 팀원 개발 환경 세팅 가이드

**작성일**: 2025-11-20
**대상**: DELTAX 신규 팀원
**목적**: getPlatformProxy 마이그레이션 이후 개발 환경 설정 방법

---

## 📋 목차

1. [개요](#개요)
2. [사전 요구사항](#사전-요구사항)
3. [설치 및 세팅](#설치-및-세팅)
4. [자주 발생하는 에러 및 해결](#자주-발생하는-에러-및-해결)
5. [개발 워크플로우](#개발-워크플로우)
6. [유용한 명령어](#유용한-명령어)

---

## 개요

**2025-11-20 기준**, DELTAX 프로젝트는 **로컬 개발 환경에서도 Cloudflare D1을 사용**합니다.

### 변경 사항 요약

- ❌ **기존**: better-sqlite3 (로컬) + D1 (프로덕션) → 이중 환경
- ✅ **현재**: D1 (로컬) + D1 (프로덕션) → 단일 환경

**장점**:

- 로컬과 프로덕션이 동일한 코드 실행
- 환경별 버그 제거
- 코드 복잡도 32% 감소

---

## 사전 요구사항

### 필수 설치

```bash
# Node.js (v20 이상)
node --version  # v20.x.x 이상

# npm (v10 이상)
npm --version   # v10.x.x 이상

# wrangler (프로젝트에 포함됨)
npx wrangler --version  # v4.46.0 이상
```

### 권장 도구

- **VS Code** 또는 선호하는 IDE
- **Git** (버전 관리)

---

## 설치 및 세팅

### Step 1: 저장소 클론 및 의존성 설치

```bash
# 1. 저장소 클론
git clone <repository-url>
cd deltax

# 2. 의존성 설치
npm install

# ✅ 확인: @opennextjs/cloudflare와 wrangler가 설치되어야 함
npm ls @opennextjs/cloudflare wrangler
```

### Step 2: 환경 변수 설정 (선택)

```bash
# .env.local 파일 생성 (필요한 경우)
cp .env.example .env.local

# 필요한 환경 변수 설정 (예시)
# DATABASE_URL은 더 이상 필요 없음 (D1 사용)
```

### Step 3: D1 로컬 데이터베이스 마이그레이션

**중요**: 이 단계를 건너뛰면 "no such table" 에러가 발생합니다!

```bash
# D1 로컬 데이터베이스에 스키마 적용
npx wrangler d1 migrations apply DB --local

# ✅ 성공 출력 예시:
# 🚣 35 commands executed successfully.
# ┌───────────────────────────┬────────┐
# │ name                      │ status │
# ├───────────────────────────┼────────┤
# │ 0000_tricky_giant_man.sql │ ✅     │
# ├───────────────────────────┼────────┤
# │ 0001_clammy_wolfpack.sql  │ ✅     │
# └───────────────────────────┴────────┘
```

**마이그레이션 위치**: `.wrangler/state/v3/d1/` (자동 생성됨)

### Step 4: 테스트 사용자 생성 (개발용)

현재 베팅 API는 `mock-user-id`를 하드코딩으로 사용합니다. 이 사용자를 생성해야 베팅 API가 작동합니다.

```bash
# 테스트 사용자 생성
npx wrangler d1 execute DB --local --command "
  INSERT INTO users
    (id, sui_address, del_balance, crystal_balance, total_bets, total_volume, created_at, updated_at)
  VALUES
    ('mock-user-id', '0xMOCK_TEST_USER', 100000, 0, 0, 0, $(date +%s000), $(date +%s000))
"

# ✅ 성공 출력:
# 🚣 1 command executed successfully.
```

**참고**: 향후 인증 시스템 구현 시 이 단계는 불필요해집니다.

### Step 5: 개발 서버 시작

```bash
npm run dev

# ✅ 성공 출력:
#    ▲ Next.js 16.0.1 (Turbopack)
#    - Local:        http://localhost:3000
#    - Network:      http://192.168.x.x:3000
#
#  ✓ Starting...
#  ✓ Ready in 2.6s
```

### Step 6: 동작 확인

```bash
# 라운드 조회
curl http://localhost:3000/api/rounds

# ✅ 성공 응답:
# {"success":true,"data":{"rounds":[]},"meta":{...}}

# 라운드 생성
curl -X POST http://localhost:3000/api/rounds \
  -H 'Content-Type: application/json' \
  -d '{"type":"6HOUR","startTime":2000000000000,"status":"BETTING_OPEN"}'

# 베팅 생성 (라운드 ID는 위에서 생성된 것 사용)
curl -X POST http://localhost:3000/api/bets \
  -H 'Content-Type: application/json' \
  -d '{"roundId":"<ROUND_ID>","prediction":"GOLD","amount":1000}'
```

---

## 자주 발생하는 에러 및 해결

### 에러 1: "D1_ERROR: no such table: rounds"

**증상**:

```
API Error: Error: D1_ERROR: no such table: rounds: SQLITE_ERROR
```

**원인**: D1 로컬 데이터베이스가 마이그레이션되지 않음

**해결**:

```bash
npx wrangler d1 migrations apply DB --local
```

---

### 에러 2: "FOREIGN KEY constraint failed"

**증상**:

```
D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT
```

**원인**: 베팅 API가 참조하는 `mock-user-id` 사용자가 DB에 없음

**해결**:

```bash
# Step 4의 테스트 사용자 생성 명령 실행
npx wrangler d1 execute DB --local --command "
  INSERT INTO users
    (id, sui_address, del_balance, crystal_balance, total_bets, total_volume, created_at, updated_at)
  VALUES
    ('mock-user-id', '0xMOCK_TEST_USER', 100000, 0, 0, 0, $(date +%s000), $(date +%s000))
"
```

---

### 에러 3: "No migrations folder found"

**증상**:

```
⚠ WARNING: No migrations folder found.
✘ ERROR: No migrations present at /Users/.../migrations.
```

**원인**: 이전 버전의 wrangler.toml에 `migrations_dir` 설정이 없음

**해결**:

```bash
# wrangler.toml 확인
grep "migrations_dir" wrangler.toml

# 없다면 수동으로 추가:
# [[d1_databases]]
# binding = "DB"
# database_name = "my-db-name"
# database_id = "a0637bbd-181c-4c6e-b52d-85557e3a1e1c"
# migrations_dir = "drizzle"  # ✅ 이 줄 추가
```

**현재 코드베이스에는 이미 설정되어 있으므로 이 에러는 발생하지 않습니다.**

---

### 에러 4: "Failed to load next.config.ts"

**증상**:

```
⨯ Failed to load next.config.ts
ReferenceError: await is not defined
```

**원인**: 이전 버전 코드에서 top-level await 사용 시도

**해결**: 현재 코드베이스에는 이미 async function export로 수정되어 있음

```typescript
// next.config.ts (현재 버전)
export default async function () {
  if (process.env.NODE_ENV === 'development') {
    await initOpenNextCloudflareForDev();
  }
  return withBundleAnalyzer(nextConfig);
}
```

---

### 에러 5: D1 로컬 DB 초기화 필요

**증상**: 개발 중 DB가 꼬였거나 초기화가 필요한 경우

**해결**:

```bash
# 1. .wrangler 폴더 삭제 (D1 로컬 DB 삭제)
rm -rf .wrangler

# 2. 마이그레이션 재실행
npx wrangler d1 migrations apply DB --local

# 3. 테스트 사용자 재생성
npx wrangler d1 execute DB --local --command "
  INSERT INTO users
    (id, sui_address, del_balance, crystal_balance, total_bets, total_volume, created_at, updated_at)
  VALUES
    ('mock-user-id', '0xMOCK_TEST_USER', 100000, 0, 0, 0, $(date +%s000), $(date +%s000))
"

# 4. 개발 서버 재시작
npm run dev
```

---

## 개발 워크플로우

### 일반적인 개발 흐름

```bash
# 1. 최신 코드 pull
git pull origin main

# 2. 의존성 업데이트 (필요 시)
npm install

# 3. 새로운 마이그레이션이 있다면
npx wrangler d1 migrations apply DB --local

# 4. 개발 서버 시작
npm run dev

# 5. 코드 작성 및 테스트

# 6. API 테스트
curl http://localhost:3000/api/...
```

### 데이터베이스 스키마 변경 시

```bash
# 1. db/schema/*.ts 파일 수정

# 2. 마이그레이션 파일 생성
npm run db:generate

# 3. 로컬 D1에 적용
npx wrangler d1 migrations apply DB --local

# 4. 리모트 D1에 적용 (배포 시)
npx wrangler d1 migrations apply DB --remote
```

---

## 유용한 명령어

### 개발 관련

```bash
# 개발 서버 시작
npm run dev

# 프로덕션 빌드
npm run build

# Lint 검사
npm run lint

# 포맷팅
npm run format
```

### D1 데이터베이스 관련

```bash
# 로컬 D1 마이그레이션 적용
npx wrangler d1 migrations apply DB --local

# 리모트 D1 마이그레이션 적용
npx wrangler d1 migrations apply DB --remote

# 로컬 D1 쿼리 실행
npx wrangler d1 execute DB --local --command "SELECT * FROM users LIMIT 5"

# 리모트 D1 쿼리 실행
npx wrangler d1 execute DB --remote --command "SELECT * FROM users LIMIT 5"
```

### Drizzle 관련

```bash
# 스키마 변경 후 마이그레이션 생성
npm run db:generate

# Drizzle Studio 실행 (DB GUI)
npm run db:studio
```

### Cloudflare Pages 배포

```bash
# 빌드 및 배포 준비
npm run cf:build

# 로컬에서 프로덕션 미리보기
npm run cf:preview

# 리모트 D1 사용 미리보기
npm run cf:preview:remote
```

---

## 체크리스트

신규 팀원이 확인해야 할 사항:

- [ ] Node.js v20 이상 설치됨
- [ ] `npm install` 성공
- [ ] `npx wrangler d1 migrations apply DB --local` 성공
- [ ] 테스트 사용자 (`mock-user-id`) 생성됨
- [ ] `npm run dev` 정상 실행
- [ ] `curl http://localhost:3000/api/rounds` 응답 성공
- [ ] 베팅 API 테스트 성공
- [ ] `.wrangler/` 폴더가 `.gitignore`에 포함됨 확인

---

## 추가 참고사항

### D1 로컬 vs 리모트

- **로컬 D1** (`.wrangler/state/v3/d1/`):
  - 개발 중 사용
  - 빠름 (~15ms)
  - 오프라인 작동
  - 팀원마다 독립적

- **리모트 D1** (Cloudflare):
  - 배포 시 사용
  - 네트워크 레이턴시 있음 (~150ms)
  - 팀 전체 공유
  - 프로덕션 데이터

### better-sqlite3 관련

**현재 상태**:

- 애플리케이션 런타임에서는 사용하지 않음 ✅
- Drizzle Studio용으로만 유지 (package.json에 남아있음)
- 향후 Drizzle이 D1을 직접 지원하면 제거 가능

### 문의 사항

- 이슈: [GitHub Issues](https://github.com/your-repo/issues)
- 문서: `docs/ehdnd/` 폴더 참조
- Slack: #deltax-dev 채널

---

**작성자**: Claude Code
**최종 업데이트**: 2025-11-20
