# 로컬 D1 개발 가이드 (wrangler proxy 기반)

## 1. 개요
- `npm run dev`에서도 `getPlatformProxy()`가 wrangler D1 로컬 시뮬레이션을 바인딩합니다. 데이터는 `.wrangler/state/**` 아래에 저장되며, 더 이상 `delta.db` 파일 폴백을 사용하지 않습니다.
- 스키마는 `db/schema/*.ts`, 마이그레이션은 `drizzle/*.sql`이 단일 진실 소스입니다. 로컬/프로덕션 모두 Drizzle+D1 API를 그대로 사용합니다.

## 2. 변경 사항 요약
- better-sqlite3 로컬 폴백 제거 → dev/prod 동일하게 D1 API 호출.
- 로컬 DB 초기화/보존은 `.wrangler/state/**`를 삭제/유지하면 됩니다.
- 로컬 적용은 `wrangler d1 migrations apply DB --local`이 표준입니다. `db:migrate:local`(delta.db)은 더 이상 사용하지 않습니다.

## 3. 빠른 시작
1) 의존성 설치
```bash
npm install
```
2) 스키마 변경이 있다면 마이그레이션 생성
```bash
npm run db:generate
```
3) 로컬 D1에 마이그레이션 적용
```bash
wrangler d1 migrations apply DB --local
```
4) 서버 실행
```bash
npm run dev
```
5) 기본 호출 예시
```bash
curl http://localhost:3000/api/rounds/current?type=6HOUR
curl -X POST http://localhost:3000/api/bets -H "Content-Type: application/json" \
  -d '{"roundId":"<UUID>","prediction":"GOLD","amount":100,"currency":"DEL","suiTxHash":"0x..."}'
```

## 4. 스키마 변경 워크플로우
1) `db/schema/*.ts` 수정  
2) `npm run db:generate` (Drizzle SQL 생성)  
3) `wrangler d1 migrations apply DB --local` (로컬 시뮬레이션 반영)  
4) `npm run dev`로 기능 테스트  
5) 원격 D1 반영 시 `npm run db:migrate` 또는 `wrangler d1 migrations apply DB --remote` (필요한 DB 이름/ID 확인)

## 5. 트러블슈팅
- `D1 database not available`: `wrangler --version` 확인 후 `npm run dev` 재시작, `wrangler login`, `wrangler d1 migrations list --local`로 바인딩 확인.
- 마이그레이션 누락: `drizzle/`에 최신 SQL이 있는지 확인하고 `wrangler d1 migrations apply DB --local` 재실행.
- 로컬 상태 초기화: `.wrangler/state/**`의 D1 파일을 삭제하거나, `wrangler d1 execute DB --local --command "DROP TABLE ..."`로 정리 후 다시 적용.
- 아직 `db:migrate:local`을 사용 중이면 제거하거나 `wrangler d1 migrations apply`로 전환하세요.

## 6. 참고 문서
- `docs/WRANGLER_DEV.md` (Cloudflare 런타임/프리뷰)
- `docs/DRIZZLE_D1_GUIDE.md`, `docs/DB_USAGE.md`
