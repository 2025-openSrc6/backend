# Wrangler 기반 Cloudflare 개발 서버 가이드

이 문서는 로컬에서 Cloudflare Pages/Workers 런타임과 D1을 동시에 사용하는 방법을 정리합니다. 기존 `npm run dev` + 로컬 SQLite 폴백 흐름은 그대로 유지됩니다.

---

## 1. 필요한 CLI/계정

- **Wrangler CLI**: devDependency로 포함되어 있으므로 `npx wrangler …`로 바로 실행할 수 있습니다. 최초 1회 `npx wrangler login`으로 계정 인증을 해야 합니다.
- **Cloudflare 계정 정보**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (팀 리드에게 요청). D1 Database ID는 이미 `wrangler.toml`에 설정되어 있습니다.
- **Node 20 + npm 10**: 기존 프로젝트 요구사항과 동일.

---

## 2. 사전 준비 절차

1. 의존성 설치
   ```bash
   npm install
   ```
2. Remote D1 최신화 (필요 시)
   ```bash
   npm run db:migrate
   ```
3. 개발 환경 변수 설정 (선택사항)
   ```bash
   cp .dev.vars.example .dev.vars
   # .dev.vars를 열어 CLOUDFLARE_API_TOKEN 등 필요한 값을 채웁니다
   # 주로 워커 런타임용 환경변수(SUI_NETWORK 등)를 설정합니다
   ```
4. Cloudflare 로그인
   ```bash
   npx wrangler login
   npx wrangler whoami  # 정상 연결 확인
   ```

---

## 3. 실행 플로우

OpenNext 어댑터는 watch 모드를 제공하지 않으므로 변경 사항이 있을 때마다 **빌드 → 프리뷰**를 반복합니다.

1. Cloudflare용 번들 생성 (`.open-next/` 출력)
   ```bash
   npm run cf:build
   ```
2. 프리뷰 서버 실행
   - 로컬 워커만 활용: `npm run cf:preview`
   - 글로벌 네트워크 + 실제 D1: `npm run cf:preview:remote`

Wrangler가 표시하는 주소(예: `http://127.0.0.1:8787`)로 접속하면 `context.cloudflare.env.DB`가 실제 D1 바인딩을 가리킵니다. 코드/스키마를 수정했으면 `cf:build`를 다시 실행한 뒤 프리뷰를 재시작하세요.

> 참고: OpenNext는 Next 16을 정식 지원하므로 별도 peer dependency 충돌이 없습니다. 다만 빌드 시간이 길 수 있으니 평소에는 `npm run dev`로 빠르게 개발하고, Cloudflare 런타임 검증 시점에만 위 플로우를 사용하는 것을 권장합니다.

CI나 네트워크가 막힌 환경에서 Google Fonts를 받지 못해 빌드가 실패한다면 `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` 환경변수를 `scripts/mock-google-fonts.cjs`로 지정해 두면 됩니다. (GitHub Actions 워크플로에 이미 반영됨.)

---

## 4. 로컬 D1 개발 흐름

- `npm run dev`도 `getPlatformProxy()`를 통해 wrangler D1 로컬 시뮬레이션(.wrangler/state/**)을 사용합니다. 별도의 `delta.db` 파일은 더 이상 쓰지 않습니다.
- 기본 작업은 `npm run dev`에서 진행하고, 스키마 변경 시 `npm run db:generate` 후 `wrangler d1 migrations apply DB --local`로 반영하세요. Cloudflare 런타임 검증은 체크포인트마다 `npm run cf:build`/`npm run cf:preview`로 확인합니다.

---

## 5. 트러블슈팅

| 증상                                       | 확인 사항                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `D1 database not available`                | `wrangler.toml`의 `database_id`가 올바른지, `npm run cf:preview:remote`를 썼는지 확인 |
| `wrangler dev`가 빌드 결과를 못 찾음       | `.open-next/` 폴더가 있는지, 직전에 `npm run cf:build`를 실행했는지 확인           |
| Next 빌드가 오래 걸림                      | 잦은 수정이 필요하면 `npm run dev`로 작업하고, 체크포인트마다 `cf:build`/`cf:preview`를 실행 |
| Cloudflare API 권한 오류                   | `npx wrangler login` 재실행 혹은 API Token 권한(D1 RW)을 확인                                     |

필요 시 `docs/LOCAL_DEV_DB.md`와 이 문서를 함께 참고해 팀 내 표준 운영 흐름을 맞춰 주세요.
