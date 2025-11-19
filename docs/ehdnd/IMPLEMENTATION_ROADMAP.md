# IMPLEMENTATION_ROADMAP.md

deltaX 베팅 시스템의 4주 구현 로드맵

---

## 📋 목차

1. [개요](#개요)
2. [Week 1: Next.js Backend Foundation](#week-1-nextjs-backend-foundation)
3. [Week 2: Sui Move Learning & Basic Contracts](#week-2-sui-move-learning--basic-contracts)
4. [Week 3: Next.js-Sui Integration](#week-3-nextjs-sui-integration)
5. [Week 4: Settlement Logic & Testing](#week-4-settlement-logic--testing)
6. [팀원별 역할](#팀원별-역할)
7. [마일스톤 및 체크포인트](#마일스톤-및-체크포인트)
8. [리스크 관리](#리스크-관리)

---

## 개요

### 프로젝트 기간

```
Week 1: 11/15 ~ 11/21 (7일)
Week 2: 11/22 ~ 11/28 (7일)
Week 3: 11/29 ~ 12/05 (7일)
Week 4: 12/06 ~ 12/12 (7일)
```

### 개발 원칙

**1. 점진적 구현 (Incremental Development)**

- Week 1: 블록체인 없이 Next.js 백엔드만 구현
- Week 2: Sui 학습 및 기본 컨트랙트
- Week 3: Next.js ↔ Sui 통합
- Week 4: 정산 로직 및 테스트

**2. 역할 분담 (Clear Boundaries)**

```
태웅: 베팅 시스템, 라운드 관리, Sui 통합
현준: 가격 데이터, 차트
도영: 메인 페이지, 랭킹, 포인트
영민: NFT, 샵
```

**3. 통합 주기 (Integration Cadence)**

- 매주 금요일: 통합 테스트 및 데모
- 매일 저녁: 코드 리뷰 및 동기화

---

## Week 1: Next.js Backend Foundation

**목표**: 블록체인 없이 완전히 동작하는 백엔드 구축

### 1.1 Day 1-2 (11/15 ~ 11/16): 프로젝트 셋업

**태웅**

```
✅ 완료 (현재 상태 기준)
- [x] Next.js 14 프로젝트 초기화
- [x] Cloudflare D1 설정 (wrangler.toml)
- [x] Drizzle ORM 스키마 작성
  - rounds, bets, users, settlements 등
- [x] 로컬 DB 폴백 로직 (better-sqlite3)

🎯 추가 작업
- [x] 환경 변수 정리 (.env.example)
- [x] 마이그레이션 스크립트 검증
  - npm run db:generate
  - npm run db:migrate:local
- [x] Git 브랜치 전략 확정
  - dev (개발), main (프로덕션)
```

**전체 팀**

```
- [x] 의존성 설치 및 개발 환경 설정
- [x] 프로젝트 문서 공유 (Notion/Slack)
- [x] API 명세 리뷰 (API_SPECIFICATION.md)
```

---

### 1.2 Day 3-4 (11/17 ~ 11/18): Core API 구현

**태웅 (Rounds & Bets)**

```
Priority 1: Rounds API
- [x] GET /api/rounds
  - 쿼리 파라미터: type, status, page, pageSize
  - 페이지네이션 구현
- [x] GET /api/rounds/current
  - 활성 라운드 조회 (가장 중요!)
  - canBet 플래그 계산
- [x] GET /api/rounds/:id
  - 라운드 상세 정보
  - settlement 정보 포함 (settled 시)

Priority 2: Bets API (Mock)
- [ ] POST /api/bets (Mock 버전)
  - Sui 트랜잭션 없이 D1에만 기록
  - 유저 잔액 검증
  - 라운드 풀 Atomic 업데이트
- [ ] GET /api/bets
  - roundId, userId 필터
  - 페이지네이션
- [ ] GET /api/bets/:id
  - 베팅 상세 정보

테스트:
- [ ] Postman Collection 작성
- [ ] 각 엔드포인트 200/400/404 케이스
```

**현준 (Prices)**

```
- [ ] lib/prices/fetcher.ts 구현
  - getPrices() 함수
  - Kitco API 또는 CoinGecko API 연동
  - 타임아웃 처리 (5초)
- [ ] GET /api/prices/current
  - 현재 가격 조회
  - Redis 캐싱 (TTL: 10초)
- [ ] 가격 검증 로직
  - validatePrice() 함수
  - 이상 변동 감지 (±20%)
```

**도영 (Users & Points)**

```
- [ ] GET /api/users/me
  - 세션 기반 유저 정보 조회
  - Mock 인증 (Sui 지갑 없이)
- [ ] GET /api/users/:id
  - 공개 프로필 조회
- [ ] PATCH /api/users/me
  - 닉네임, 프로필 색상 변경
- [ ] POST /api/points/attendance
  - 출석 체크 로직
  - 5,000 DEL 지급
  - 연속 출석일 업데이트
```

**영민 (NFT & Shop)**

```
- [ ] GET /api/nfts/shop
  - NFT 템플릿 목록
  - 티어별 가격 정보
- [ ] POST /api/nfts/purchase (Mock)
  - DEL 차감
  - achievements 테이블 기록
  - Sui NFT 민팅은 Week 3에
```

---

### 1.3 Day 5-6 (11/19 ~ 11/20): 라운드 FSM & Cron Jobs

**태웅 (FSM 구현)**

```
Priority 1: FSM 로직
- [ ] lib/rounds/fsm.ts
  - canTransition() 함수
  - transitionRoundStatus() 함수
  - ALLOWED_TRANSITIONS 상수
- [ ] round_transitions 테이블 활용
  - 모든 상태 전이 기록

Priority 2: Cron Job 스켈레톤
- [ ] app/api/cron/rounds/create/route.ts
  - Job 1: Round Creator
  - SCHEDULED 라운드 생성
- [ ] app/api/cron/rounds/open/route.ts
  - Job 2: Round Opener
  - BETTING_OPEN으로 전환
  - Mock 가격 스냅샷 (하드코딩)
- [ ] app/api/cron/rounds/lock/route.ts
  - Job 3: Betting Locker
  - BETTING_LOCKED로 전환

테스트:
- [ ] 수동 Cron 트리거 (Postman)
  - POST /api/cron/rounds/create
  - POST /api/cron/rounds/open
  - POST /api/cron/rounds/lock
- [ ] 상태 전이 시퀀스 검증
  - SCHEDULED → BETTING_OPEN → BETTING_LOCKED
```

**전체 팀**

```
- [ ] API 통합 테스트
  - 각자 구현한 API 서로 호출
  - 에러 케이스 처리 확인
- [ ] Postman Collection 공유
```

---

### 1.4 Day 7 (11/21): Week 1 통합 & 데모

**전체 팀**

```
- [ ] 통합 테스트
  - 전체 플로우 시나리오 실행
    1. 라운드 생성 (Cron)
    2. 라운드 조회 (GET /api/rounds/current)
    3. 베팅 생성 (POST /api/bets)
    4. 베팅 조회 (GET /api/bets?roundId=...)
    5. 라운드 마감 (Cron)
- [ ] 버그 수정
- [ ] Week 2 준비
  - Sui 학습 자료 공유
  - Move 튜토리얼 시작
```

**산출물**

```
✅ 동작하는 Next.js 백엔드 (Sui 제외)
✅ D1 스키마 완성
✅ 16개 REST API 엔드포인트
✅ Cron Job 스켈레톤 3개
✅ Postman Collection
```

---

## Week 2: Sui Move Learning & Basic Contracts

**목표**: Sui Move 학습 및 기본 컨트랙트 작성

### 2.1 Day 1-3 (11/22 ~ 11/24): Sui Move 학습

**태웅 (Lead)**

```
Day 1: 기초 학습
- [ ] Sui 공식 문서 읽기
  - https://docs.sui.io
  - Move 언어 기초
  - Object 모델 이해
- [ ] Sui CLI 설치 및 테스트
  - sui move build
  - sui client publish
- [ ] 예제 컨트랙트 실행
  - Counter 예제
  - Coin 예제

Day 2-3: 실전 코딩
- [ ] del_coin.move 작성
  - One-Time Witness 패턴
  - mint, burn 함수
- [ ] betting.move 기초
  - Bet struct 정의
  - BettingPool struct 정의
  - create_pool() 함수
  - place_bet() 함수 (간단 버전)
- [ ] 로컬 테스트
  - sui move test
```

**전체 팀**

```
- [ ] Sui 기초 학습 (각자 2시간)
  - Move Book 읽기
  - Sui Examples 실행
- [ ] 팀 내 지식 공유
  - 태웅이 학습한 내용 공유 (1시간)
```

---

### 2.2 Day 4-5 (11/25 ~ 11/26): 컨트랙트 완성

**태웅**

```
Priority 1: betting.move 완성
- [ ] place_bet() 로직 완성
  - 베팅 가능 시간 검증
  - DEL 코인 Lock
  - BettingPool 업데이트
  - Bet Object 생성
  - Event 발생
- [ ] lock_pool() 함수
  - Admin만 호출 가능
  - 상태 변경 (OPEN → LOCKED)

Priority 2: settlement.move 기초
- [ ] Settlement struct 정의
- [ ] finalize_round() 함수
  - 승자 판정
  - Settlement Object 생성
- [ ] distribute_payout() 스켈레톤

테스트:
- [ ] Move 단위 테스트 작성
  - tests/betting_tests.move
  - test_place_bet()
  - test_lock_pool()
```

**영민 (NFT 컨트랙트 지원)**

```
- [ ] nft.move 기초
  - NFT struct 정의
  - mint_nft() 함수
- [ ] Pinata IPFS 연동 준비
```

---

### 2.3 Day 6-7 (11/27 ~ 11/28): Testnet 배포

**태웅**

```
Day 6: 배포 준비
- [ ] Move.toml 설정
  - 의존성 정리
  - 버전 관리
- [ ] 컴파일 및 빌드
  - sui move build
  - 에러 수정

Day 7: Testnet 배포
- [ ] Sui Testnet Faucet
  - SUI 코인 받기
- [ ] 컨트랙트 배포
  - sui client publish --gas-budget 100000000
- [ ] Package ID 기록
  - NEXT_PUBLIC_SUI_PACKAGE_ID
- [ ] Admin Keypair 생성
  - 환경 변수로 관리

검증:
- [ ] Sui Explorer에서 확인
  - Package ID 조회
  - 함수 확인
- [ ] sui client call 테스트
  - create_pool() 호출
  - place_bet() 호출
```

**산출물**

```
✅ del_coin.move (완성)
✅ betting.move (완성)
✅ settlement.move (기초)
✅ Testnet 배포 완료
✅ Package ID 확보
✅ Move 단위 테스트
```

---

## Week 3: Next.js-Sui Integration

**목표**: Next.js와 Sui 블록체인 통합

### 3.1 Day 1-2 (11/29 ~ 11/30): Sui Client 설정

**태웅**

```
Day 1: Sui.js 통합
- [ ] 의존성 설치
  - @mysten/sui.js
  - @mysten/dapp-kit
- [ ] lib/sui/client.ts 작성
  - SuiClient 초기화
  - PACKAGE_ID 상수
- [ ] lib/sui/betting.ts 작성
  - placeBetOnSui() 함수
  - Admin Keypair 로드
  - Sponsored Transaction

Day 2: API 업데이트
- [ ] POST /api/bets 수정
  - Mock → 실제 Sui 호출
  - placeBetOnSui() 사용
  - Sui 트랜잭션 검증
  - D1에 sui_tx_hash, sui_bet_object_id 저장
- [ ] 에러 처리
  - Sui 트랜잭션 실패 시
  - D1 저장 실패 시
  - 복구 큐 로직

테스트:
- [ ] Postman으로 실제 베팅 호출
  - Testnet 확인
- [ ] Sui Explorer에서 트랜잭션 확인
```

**현준 (가격 데이터 실제 연동)**

```
- [ ] Kitco API 실제 연동
  - API 키 발급
  - 실시간 금 가격
- [ ] CoinGecko API 연동
  - BTC 가격
- [ ] Redis 캐싱 구현
  - price:gold:latest
  - price:btc:latest
  - TTL: 10초
```

**도영 (인증 시스템)**

```
- [ ] Sui 지갑 기반 인증
  - POST /api/auth/session
  - 서명 검증
  - 세션 생성
- [ ] Middleware 추가
  - 모든 API에 인증 체크
  - 유저 정보 주입
```

---

### 3.2 Day 3-4 (12/01 ~ 12/02): 라운드 Cron with Sui

**태웅**

```
Day 3: Cron Job 2 (Round Opener)
- [ ] 실제 가격 스냅샷
  - 현준 API 호출 (getPrices)
  - D1 업데이트 (gold_start_price, btc_start_price)
- [ ] Sui Pool 생성
  - create_pool() 호출
  - sui_pool_address 저장
- [ ] 상태 전이
  - SCHEDULED → BETTING_OPEN

Day 4: Cron Job 3 (Betting Locker)
- [ ] Sui Pool 잠금
  - lock_pool() 호출
- [ ] 상태 전이
  - BETTING_OPEN → BETTING_LOCKED

테스트:
- [ ] 전체 플로우 (Sui 포함)
  1. Cron: 라운드 생성 + Pool 생성
  2. 유저: 베팅 (Sui 트랜잭션)
  3. Cron: 베팅 마감 (Pool 잠금)
  4. D1 + Sui 데이터 일치 확인
```

**영민 (NFT Sui 통합)**

```
- [ ] NFT 민팅 Sui 호출
  - mint_nft() 함수
  - IPFS 메타데이터 업로드
  - Sui NFT Object 생성
- [ ] POST /api/nfts/purchase 완성
  - 실제 Sui 호출
  - sui_nft_object_id 저장
```

---

### 3.3 Day 5-6 (12/03 ~ 12/04): WebSocket 실시간 업데이트

**태웅**

```
Day 5: WebSocket Server 구현
- [ ] lib/websocket/server.ts
  - Socket.io 서버 초기화
  - 이벤트 핸들러
- [ ] 이벤트 발행
  - bet:placed
  - round:update
  - round:status_changed
- [ ] 클라이언트 연결 테스트

Day 6: 프론트엔드 통합
- [ ] 베팅 시 실시간 풀 업데이트
- [ ] 라운드 상태 변경 알림
- [ ] 베팅 마감 카운트다운
```

**전체 팀**

```
- [ ] WebSocket 이벤트 구독
  - 각자 담당 페이지에서
  - 실시간 UI 업데이트
```

---

### 3.4 Day 7 (12/05): Week 3 통합 & 데모

**전체 팀**

```
- [ ] End-to-End 테스트
  - 라운드 생성 (Sui Pool)
  - 베팅 (Sui Tx)
  - 실시간 업데이트 (WebSocket)
  - 베팅 마감 (Sui Lock)
- [ ] 버그 수정
- [ ] 성능 테스트
  - 동시 베팅 10명
  - 응답 시간 측정
```

**산출물**

```
✅ Next.js ↔ Sui 완전 통합
✅ 실제 베팅 플로우 동작
✅ WebSocket 실시간 업데이트
✅ 인증 시스템 (Sui 지갑)
✅ NFT 민팅 동작
```

---

## Week 4: Settlement Logic & Testing

**목표**: 정산 로직 완성 및 전체 테스트

### 4.1 Day 1-2 (12/06 ~ 12/07): 정산 로직 구현

**태웅**

```
Day 1: Cron Job 4 (Round Finalizer)
- [ ] End Price 스냅샷
  - getPrices() 호출
  - D1 업데이트 (gold_end_price, btc_end_price)
- [ ] 승자 판정
  - 변동률 계산
  - winner 결정 (GOLD/BTC/DRAW)
- [ ] Sui Settlement 생성
  - finalize_round() 호출
  - sui_settlement_object_id 저장
- [ ] 상태 전이
  - BETTING_LOCKED → PRICE_PENDING → CALCULATING

Day 2: Cron Job 5 (Settlement Processor)
- [ ] 승자 조회 (D1)
  - SELECT bets WHERE prediction=winner
- [ ] 배당 계산
  - payout_ratio = (total_pool - fee) / winning_pool
  - 각 승자별 payout_amount
- [ ] Sui 배당 전송 (루프)
  - distribute_payout() 호출 (각 승자)
  - sui_payout_tx_hash 저장
- [ ] D1 업데이트
  - settlement_status = 'COMPLETED', result_status = 'WON'/'LOST'/'REFUNDED'
  - 유저 잔액 업데이트
- [ ] 상태 전이
  - CALCULATING → SETTLED/VOIDED

테스트:
- [ ] 전체 정산 플로우
  - 라운드 생성 → 베팅 → 종료 → 정산
  - 승자 배당 확인 (D1 + Sui)
  - 무승부 환불 케이스
```

**현준 (가격 Fallback 구현)**

```
- [ ] getPricesWithRetry() 함수
  - 최대 3회 재시도
  - 타임아웃 처리
- [ ] Fallback 정책
  - Redis 캐시 조회
  - 마지막 성공 가격 사용
  - 실패 시 라운드 취소
```

---

### 4.2 Day 3-4 (12/08 ~ 12/09): 복구 로직 & 에러 처리

**태웅**

```
Day 3: Recovery Job 구현
- [ ] lib/recovery/queue.ts
  - 복구 큐 (Redis 또는 D1)
  - add, process 함수
- [ ] Cron Job 6 (Recovery)
  - CALCULATING 상태 10분 이상 방치된 라운드
  - 미정산 베팅 재처리
  - 3회 실패 시 Slack 알림
- [ ] 서버 시작 시 복구
  - recoverIncompleteSettlements()
  - CALCULATING 라운드 자동 재정산

Day 4: 에러 처리 강화
- [ ] Sui 트랜잭션 실패 처리
  - 재시도 로직
  - 사용자 친화적 에러 메시지
- [ ] D1 저장 실패 처리
  - 복구 큐 추가
  - 백그라운드 동기화
- [ ] Slack 알림 시스템
  - Critical 에러 알림
  - 데이터 불일치 알림
```

**전체 팀**

```
- [ ] 에러 시나리오 테스트
  - Sui RPC 타임아웃
  - D1 연결 실패
  - 가격 API 실패
  - 서버 재시작 (복구 테스트)
```

---

### 4.3 Day 5-6 (12/10 ~ 12/11): 통합 테스트 & 최적화

**전체 팀**

```
Day 5: 통합 테스트
- [ ] 시나리오 기반 테스트
  1. 정상 플로우 (베팅 → 정산)
  2. 무승부 환불
  3. 베팅 마감 후 시도
  4. 동시 베팅 (10명)
  5. 정산 중 서버 재시작
- [ ] Jest 테스트 작성
  - API 단위 테스트
  - 통합 테스트
- [ ] Coverage 측정
  - 목표: 80% 이상

Day 6: 성능 최적화
- [ ] D1 쿼리 최적화
  - 인덱스 확인
  - N+1 쿼리 제거
- [ ] Sui 트랜잭션 최적화
  - Batch 처리 검토
  - 가스비 최적화
- [ ] 캐싱 강화
  - Redis 활용
  - 자주 조회되는 데이터
```

---

### 4.4 Day 7 (12/12): 최종 데모 & 배포 준비

**전체 팀**

```
- [ ] 최종 통합 데모
  - 교수님/학생 대상
  - 전체 플로우 시연
  - Q&A 준비
- [ ] 문서 정리
  - README.md 업데이트
  - API 문서 최종 검토
  - 배포 가이드 작성
- [ ] 배포 준비 (선택적)
  - Cloudflare Pages 배포
  - D1 프로덕션 마이그레이션
  - 환경 변수 설정
```

**산출물**

```
✅ 완전히 동작하는 베팅 시스템
✅ 정산 로직 완성
✅ 복구 및 에러 처리
✅ 통합 테스트 (80% 커버리지)
✅ 최종 데모 자료
✅ 배포 가능한 상태
```

---

## 팀원별 역할

### 장태웅 (베팅 시스템 & 라운드 관리)

**핵심 책임**

- 라운드 생성, 상태 관리 (FSM)
- 베팅 API (POST /api/bets)
- Cron Jobs (6개)
- Sui Move 컨트랙트 (betting, settlement)
- Sui 통합 (Next.js ↔ Sui)

**주요 산출물**

- API: /rounds, /bets, /settlements
- Cron: 라운드 생성/시작/마감/종료/정산
- Move: betting.move, settlement.move, del_coin.move
- 문서: FSM.md, SUI_INTEGRATION.md

---

### 김현준 (가격 데이터 & 차트)

**핵심 책임**

- 실시간 가격 데이터 수집
- 가격 스냅샷 (Start/End Price)
- 차트 UI 구현
- 가격 검증 및 Fallback

**주요 산출물**

- API: /prices/current
- 함수: getPrices(), validatePrice()
- UI: 금/BTC 차트 컴포넌트
- Redis 캐싱

---

### 김도영 (메인 페이지 & 랭킹)

**핵심 책임**

- 메인 페이지 UI
- 유저 랭킹 시스템
- 출석 체크
- 포인트 관리

**주요 산출물**

- API: /users, /points, /rankings
- UI: 메인 대시보드, 랭킹 페이지
- 출석 보상 로직

---

### 김영민 (NFT & 샵)

**핵심 책임**

- NFT 민팅 및 관리
- 상점 시스템
- IPFS 업로드 (Pinata)
- Sui NFT 통합

**주요 산출물**

- API: /nfts, /shop
- Move: nft.move
- UI: NFT 상점, 프로필
- IPFS 메타데이터 관리

---

## 마일스톤 및 체크포인트

### Milestone 1 (Week 1 종료)

```
✅ Next.js 백엔드 완성 (Sui 제외)
✅ D1 스키마 및 마이그레이션
✅ 16개 REST API
✅ Cron Job 스켈레톤
✅ 팀 전체 통합 성공
```

**검증 방법**

- Postman으로 전체 플로우 실행
- D1 데이터 정합성 확인

---

### Milestone 2 (Week 2 종료)

```
✅ Sui Move 컨트랙트 작성
✅ Testnet 배포 완료
✅ Package ID 확보
✅ Move 단위 테스트
```

**검증 방법**

- Sui Explorer에서 Package 확인
- sui client call 테스트 성공

---

### Milestone 3 (Week 3 종료)

```
✅ Next.js ↔ Sui 완전 통합
✅ 실제 베팅 플로우 동작
✅ WebSocket 실시간 업데이트
✅ 인증 시스템
```

**검증 방법**

- E2E 테스트 (베팅 → 마감)
- Sui 트랜잭션 확인
- WebSocket 이벤트 수신

---

### Milestone 4 (Week 4 종료)

```
✅ 정산 로직 완성
✅ 복구 및 에러 처리
✅ 통합 테스트 (80% 커버리지)
✅ 최종 데모 준비
```

**검증 방법**

- 전체 플로우 (생성 → 정산) 성공
- Jest 테스트 통과
- 교수님 데모 시연

---

## 리스크 관리

### 리스크 1: Sui 학습 곡선

**문제**

- Move 언어가 생소함
- Sui 생태계가 신생

**완화 전략**

- Week 2 전체를 학습에 할애
- 태웅이 먼저 학습 후 팀 공유
- 공식 문서 및 예제 적극 활용
- Discord/Forum에서 질문

---

### 리스크 2: Sui Testnet 불안정

**문제**

- Testnet RPC가 간헐적으로 다운될 수 있음
- 트랜잭션 실패율 증가

**완화 전략**

- 재시도 로직 필수 구현
- Fallback RPC 엔드포인트 준비
- 로컬 Sui 노드 실행 (비상용)
- Mock 모드 유지 (Sui 없이도 동작)

---

### 리스크 3: 통합 지연

**문제**

- 팀원 간 API 인터페이스 불일치
- 통합 시점에 버그 다수 발견

**완화 전략**

- Week 1부터 API 명세 확정 (API_SPECIFICATION.md)
- 매일 저녁 코드 리뷰 및 동기화
- 매주 금요일 통합 테스트 필수
- Postman Collection 공유 및 업데이트

---

### 리스크 4: 가스비 고갈

**문제**

- Admin Wallet의 SUI 잔액 부족
- Sponsored Transaction 실패

**완화 전략**

- Admin Wallet SUI 잔액 모니터링
- 알림 시스템 구축 (잔액 < 100 SUI)
- Testnet Faucet 주기적 요청
- 가스비 최적화 (Batch Transaction)

---

### 리스크 5: 타임라인 초과

**문제**

- 예상보다 구현 시간 증가
- 4주 내 완성 불가

**완화 전략**

- MVP 우선 (필수 기능만)
- Nice-to-have 기능 후순위
  - 1분 라운드 → Week 5 이후
  - 복잡한 NFT 효과 → Week 5 이후
- 매일 진행 상황 체크
- 블로커 발생 시 즉시 공유

---

## 요약

### 4주 타임라인 요약

| Week | 주요 목표                 | 산출물                      |
| ---- | ------------------------- | --------------------------- |
| 1    | Next.js 백엔드 (Sui 제외) | 16개 API, Cron 스켈레톤     |
| 2    | Sui Move 학습 & 컨트랙트  | 배포된 Package, Move 테스트 |
| 3    | Next.js ↔ Sui 통합       | 실제 베팅 플로우, WebSocket |
| 4    | 정산 로직 & 테스트        | 완성된 시스템, 최종 데모    |

### 핵심 성공 지표

```
✅ 라운드 생성 → 베팅 → 정산 전체 플로우 동작
✅ Sui 블록체인과 완전 통합
✅ 80% 이상 테스트 커버리지
✅ 교수님/학생 대상 데모 성공
✅ 배포 가능한 상태
```

### 다음 단계 (Week 5 이후)

**선택적 개선 사항**

- 1분 라운드 구현
- 1일 라운드 구현
- 고급 NFT 효과
- 프로덕션 배포 (Mainnet)
- 모바일 최적화
- 다국어 지원

---
