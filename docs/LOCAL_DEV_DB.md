## 로컬 DB 폴백 가이드 (팀 공용)

### 목차

- 1. 개요
- 2. 무엇이 추가/변경되었나
- 3. 기본 개념
- 4. 단계별 실행 가이드
- 5. 스키마 변경 워크플로우
- 6. D1(원격) 적용은 언제/어떻게?
- 7. 트러블슈팅

---

### 1. 개요

개발 중 Cloudflare D1 바인딩이 없는 로컬 `next dev` 환경에서도 API를 테스트할 수 있도록, 로컬 SQLite 파일(`delta.db`)로 폴백하는 경로가 추가되었습니다. 이제 모든 팀원이 로컬에서 바로 API를 호출·개발할 수 있습니다.

---

### 2. 무엇이 추가/변경되었나

- 로컬 폴백 로직 추가: `lib/db.ts`
  - Cloudflare 바인딩(`context.cloudflare.env.DB`)이 없으면, `better-sqlite3`로 `delta.db` 파일에 연결
- 스키마 정리:
  - `db/schema/rounds.ts`, `db/schema/bets.ts` 분리
  - 코드 속성은 camelCase, 실제 컬럼명은 snake_case로 매핑
- D1 클라이언트 타입 개선:
  - `db/client.ts`, `db/d1-client.ts`에서 `schema`를 주입해 타입 안정성 향상
- 마이그레이션 스크립트 추가:
  - 로컬 적용: `npm run db:migrate:local`
  - 원격 D1 적용: `npm run db:migrate` → `drizzle/` 폴더의 “최신 .sql”을 자동 적용
- .gitignore 업데이트:
  - `delta.db`, `*.db`, `*.sqlite*` 등 로컬 DB 파일은 git에 커밋되지 않음

---

### 3. 기본 개념

- 스키마(schema): `db/schema/*.ts`의 Drizzle 모델 정의. “진실의 단일 소스”
- 마이그레이션(migration): 스키마 변경으로 생성되는 SQL 변경 기록(`drizzle/*.sql`)
- 폴백(fallback): D1이 없을 때 로컬 SQLite 파일로 대체 연결

권장 네이밍 규칙

- DB(컬럼/인덱스/제약): snake_case (예: `round_id`, `created_at`)
- 코드(속성/변수): camelCase (예: `roundId`, `createdAt`)

---

### 4. 단계별 실행 가이드

사전 준비

1. 의존성 설치

```bash
npm install
```

2. 빠른 준비(권장, 원커맨드)

```bash
npm run db:dev:prepare   # = db:generate + db:migrate:local
```

3. 수동 단계(상세)

```bash
# 스키마 변경이 있었거나 최초 실행 시
npm run db:generate
npm run db:migrate:local
```

4. 서버 실행

```bash
npm run dev
```

5. Postman/HTTP 호출 예시

```bash
# 라운드 목록
GET http://localhost:3000/api/rounds

# 현재 라운드
GET http://localhost:3000/api/rounds/current?type=6HOUR

# 베팅 목록(라운드별)
GET http://localhost:3000/api/bets?roundId=<라운드UUID>

# 베팅 생성
POST http://localhost:3000/api/bets
Content-Type: application/json
{
  "roundId": "d3b3b2a0-...-...",
  "userAddress": "0x123...",
  "prediction": "GOLD",
  "amount": 100,
  "currency": "DEL",
  "suiTxHash": "0x..."
}
```

참고: 로컬 DB 파일 경로는 `DATABASE_URL` 환경변수로 바꿀 수 있습니다. 예) `DATABASE_URL=file:./my_local.db`

---

### 5. 스키마 변경 워크플로우

1. 스키마 수정: `db/schema/*.ts` (예: 새 컬럼 추가)
2. 마이그레이션 생성:

```bash
npm run db:generate
```

3. 로컬 적용:

```bash
npm run db:migrate:local
```

4. 기능 개발/테스트 (`npm run dev` + Postman)
5. 원격 적용(D1가 준비되면):

```bash
npm run db:migrate
```

주의: 기존 마이그레이션 파일은 수정하지 않습니다. 변경마다 새로운 파일이 생성되도록 유지합니다.

---

### 6. D1(원격) 적용은 언제/어떻게?

- 추천 흐름: 로컬 폴백으로 빠르게 개발 → 스테이징/프리뷰에서 D1로 검증 → 프로덕션 연결
- 준비물(팀장에게 요청)
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`(D1 RW 권한)
  - `CLOUDFLARE_D1_ID`
- 적용:

```bash
# 최신 마이그레이션 파일을 자동으로 찾아 적용
npm run db:migrate

# DB 이름 커스터마이즈(기본값: deltax-db)
CF_D1_DB_NAME=my-db npm run db:migrate
```

- Cloudflare 런타임에서 바로 테스트하고 싶다면 `docs/WRANGLER_DEV.md`의 흐름(Next → Cloudflare 번들 + `wrangler pages dev`)을 참고하세요.

---

### 7. 트러블슈팅

- 로컬에서 “D1 database not available”:
  - `lib/db.ts` 폴백이 동작해야 합니다. `npm install`이 선행되었는지 확인
  - `better-sqlite3` 설치 실패 시, Node-gyp 툴체인이 필요한 경우가 있습니다(WSL: `build-essential` 등)
- 컬럼/필드 이름 불일치:
  - 스키마는 snake_case, 코드/라우트는 camelCase를 사용합니다. 스키마 수정 후 마이그레이션 재생성/적용 필수
- 마이그레이션 파일명 불일치:
  - 이제 `npm run db:migrate`가 최신 파일을 자동으로 선택합니다. 그래도 오류가 나면 `drizzle/` 폴더에 `.sql`이 존재하는지 확인
- 로컬 DB 지속성/초기화:
  - `delta.db`는 파일 기반이라 서버를 껐다 켜도 데이터가 유지됩니다
  - 초기화하려면 로컬 DB 파일을 삭제하거나 `DATABASE_URL=file:./my_local.db` 등 새 파일을 지정하세요

---

문의

- 로컬 폴백이나 마이그레이션 흐름에서 이슈가 있으면 `docs/DRIZZLE_D1_GUIDE.md`, `docs/DB_USAGE.md`와 함께 이 문서를 참고하고 팀에 공유해주세요.
