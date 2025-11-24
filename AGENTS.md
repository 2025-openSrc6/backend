# Repository Guidelines

## Project Structure & Key Docs

- Ownership: 장태웅 — 라운드/베팅 서버 로직 (`app/api/rounds`, `app/api/bets`, cron, 정산); UI는 건드리지 않음.
- Read first (core): `docs/ehdnd/specification.md`, `docs/ehdnd/API_SPECIFICATION.md`. Reference as needed: `docs/ehdnd/CRON_JOB_SPECIFICATION.md`, `docs/ehdnd/SUI_INTEGRATION.md`, `docs/ehdnd/USER_FLOW.md`, `docs/ehdnd/ARCHITECTURE_GUIDE.md`, `docs/ehdnd/FSM*.md`, `docs/ehdnd/BET_API_IMPLEMENTATION.md`, testing guides, migration notes.
- Layout: Controllers in `app/api/**/route.ts`; services/repos under `lib/{rounds,bets}/**`; DI assembler `lib/registry.ts`; Drizzle schema in `db/schema`, generated SQL in `drizzle/`; tests in `__tests__/`.
- Runtime: Next.js 16 + TS, Drizzle + D1 via Wrangler D1 proxy (local binding under `.wrangler/**`), Sui integration with Move modules in `contracts/`.

## Build, Test, and Development Commands

- `npm run dev` → local API/UI; `npm run build` / `npm run start` for prod sanity; `npm run analyze` for bundle stats.
- Quality: `npm run lint`, `npm run format[:check]`.
- Tests: `npm run test`, `npm run test:watch`, `npm run test:coverage` (targets `app/api/**`, `lib/{bets,rounds}/**`).
- DB: `npm run db:generate` → `npm run db:migrate:local`; `npm run db:dev:prepare` chains both. Cloudflare preview/build via `npm run cf:*`.

## Coding Style & Layering

- Prettier (2-space, 100 cols, single quotes, trailing commas, semicolons); ESLint extends Next core-web-vitals with Vitest globals; avoid `any`.
- Follow 3-layer guide: Controller handles parsing/HTTP, Service holds business rules (FSM, validation, payouts), Repository isolates queries. Use `registry` for DI instead of `new` inside handlers.
- Module alias `@` maps to repo root; keep domain modules in `lib/<domain>` with colocated types/utilities; hooks named `use*`.

## Rounds & Bets Focus

- Align with FSM/cron in `specification.md`: 6h rounds → scheduled → open 1m → locked → price_pending → calculating → settled/void/cancel; hard-lock POST `/api/bets` by status/time checks + atomic pool updates.
- Sui-first writes: validate state, execute Sui tx (lock bet), then persist D1 (`bets`, pool aggregates). Settlement: snapshot end prices, compute winner/payout pool, create Sui settlement/payouts, update D1 idempotently.
- Concurrency: use single atomic UPDATEs for pools/status; wrap bet insert + pool update in one transaction; avoid read-modify-write.
- Error policy: follow `ERROR_HANDLING_GUIDE.md`; cancel/refund paths per spec; persist `sui_tx_hash/object_id` for audit.

## Testing Guidelines

- Cover lock-window edges, invalid transitions, payout math, and recovery (idempotent settlement); mirror examples in `__tests__/lib/rounds/fsm.test.ts` and `docs/ehdnd/TESTING_*`.
- Prefer service-level tests with mocked Sui/price fetchers; share fixtures via `vitest.setup.ts` or local helpers.
- Run `npm run test:coverage` before PR; ensure thresholds (lines/statements 60%, branches 50%, functions 60%).

## Commit & PR Guidelines

- Commit style from history: `type: summary` (e.g., `feat:`, `fix:`, `test:`, `docs:`, `chore:`) in imperative mood; keep scope narrow.
- PR checklist: brief description, linked issue/task, commands run (lint/test/format/db generate+migrate), screenshots only if API changes are user-visible, call out schema/migration impacts.
- Document any TODOs/follow-ups explicitly; include recovery plan when touching cron/settlement flows.

## Issue Handling Protocol

- Always reproduce first. Capture the exact environment (wrangler D1 proxy binding, script versions, inputs) and logs before touching code.
- Analyze to isolate the root cause; consult project specs, official docs, and best practices before deciding on a fix. If needed, you could search on Web (recommend).
- Draft a fix plan (key steps, risky areas, and only essential code snippets you’ll need), share for review, and adjust if needed before implementation.
- Implement after plan sign-off; keep changes scoped to the agreed plan.
- After completion, write a short MD postmortem covering: problem, repro (env/logs), root cause, how fixed, why this approach, and the final result.

## Security & Configuration

- Use `.env.local` and `.dev.vars` from examples; never commit secrets. Ensure `DATABASE_URL`/`CLOUDFLARE_D1_ID` match target D1.
- Regenerate Drizzle artifacts after schema edits and review `drizzle/` diffs; avoid committing local D1 state under `.wrangler/**`, `.next/`, or coverage outputs (legacy `delta.db` is no longer used).
- Keep Sui admin keys out of repo; prefer sponsored tx pattern per `SUI_INTEGRATION.md`.
