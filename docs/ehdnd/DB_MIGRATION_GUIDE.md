# D1 마이그레이션 빠른 가이드

로컬(wrangler D1 파일)과 원격(Cloudflare D1) 모두에 스키마 변경을 반영하는 절차를 정리한 문서입니다.

## 환경 변수

- 로컬 DB 파일: `DATABASE_URL=file:./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<sqlite 파일>.sqlite`
  - `wrangler dev` 또는 `npm run dev`를 한 번 실행하면 `.wrangler/state/...sqlite`가 생성됩니다.
  - 각자 파일명이 다르니 `ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject`로 확인 후 `.env.local`에 넣어둡니다.
- 원격 D1 이름: `CF_D1_DB_NAME=<cloudflare d1 name>` (원격 마이그레이션 때만 필요)
- 워커 환경 변수: 로컬 워커 실행 시 `.dev.vars`를 사용할 수 있지만, 마이그레이션은 위 두 변수만 있으면 됩니다.

## 기본 플로우

1. **마이그레이션 생성**  
   `npm run db:generate`
   - `DATABASE_URL` 필요. `drizzle/`에 SQL 파일이 생성됩니다.

2. **로컬 D1 적용**  
   `npm run db:migrate:local`
   - `.env.local`에 설정된 `DATABASE_URL`을 사용해 `.wrangler/...sqlite`에 반영됩니다.

3. **원격 D1 적용**  
   `CF_D1_DB_NAME=<your-d1-name> npm run db:migrate`
   - 최신 SQL 하나를 원격 D1에 적용합니다. (내부적으로 `wrangler d1 execute ... --remote --file=<latest.sql>` 실행)

## 런타임 별 DB 구분

- `npm run dev` 또는 `wrangler dev` (기본): 로컬 D1 파일 사용.
- `wrangler dev --remote`: 원격 D1 사용.
- 배포 환경: 원격 D1 사용.

## 검증 팁

- 로컬 인덱스 확인:  
  `sqlite3 ./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<file>.sqlite "PRAGMA index_list('rounds');"`
- 원격 인덱스 확인:  
  `npx wrangler d1 execute <your-d1-name> --remote --command "PRAGMA index_list('rounds');"`

## 주의 사항

- `.env.local`의 `DATABASE_URL`은 각자 경로가 달라 팀원이 그대로 쓸 수 없습니다. 경로 작성법만 공유하세요.
- 원격 마이그레이션 전에 로컬에서 `db:generate` → `db:migrate:local`로 스키마를 확인하고 진행하세요.
- 유니크 인덱스(type+start_time 등) 추가 후, 중복 데이터가 이미 있으면 원격 적용이 실패할 수 있으니 사전 데이터 정리 여부를 확인하세요.
