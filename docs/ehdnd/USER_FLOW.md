# USER_FLOW.md

deltaX 베팅 시스템의 유저 플로우 시퀀스 다이어그램

---

## 📋 목차

1. [개요](#개요)
2. [회원가입 및 로그인](#회원가입-및-로그인)
3. [베팅 플로우](#베팅-플로우)
4. [정산 플로우](#정산-플로우)
5. [출석 체크](#출석-체크)
6. [NFT 구매](#nft-구매)
7. [에러 시나리오](#에러-시나리오)

---

## 개요

### 플로우 다이어그램 구성

모든 플로우는 다음 액터들 간의 상호작용으로 표현됩니다:

- **유저 (User)**: 실제 사용자
- **프론트엔드 (Frontend)**: React UI
- **Next.js API**: 백엔드 API 서버
- **D1 Database**: Cloudflare D1 (SQLite)
- **Sui Blockchain**: Sui 블록체인
- **Cron Job**: 스케줄러 (라운드 관리)

---

## 회원가입 및 로그인

### Sui 지갑 연동 플로우

```mermaid
sequenceDiagram
    participant U as 유저
    participant F as Frontend
    participant W as Sui Wallet
    participant API as Next.js API
    participant DB as D1 Database

    U->>F: "지갑 연결" 버튼 클릭
    F->>W: requestAccounts()
    W-->>U: 지갑 비밀번호 입력 요청
    U->>W: 비밀번호 입력
    W-->>F: 지갑 주소 (0x742d...)

    F->>W: signMessage("Login to DeltaX")
    W-->>U: 서명 요청
    U->>W: 승인
    W-->>F: 서명 (signature)

    F->>API: POST /api/auth/session<br/>{suiAddress, signature, message}
    
    API->>API: 서명 검증 (cryptography)
    alt 서명 유효
        API->>DB: SELECT * FROM users<br/>WHERE sui_address = ?
        alt 기존 유저
            DB-->>API: 유저 정보
            API->>API: 세션 생성
            API-->>F: {sessionId, user}
        else 신규 유저
            API->>DB: INSERT INTO users<br/>(id, sui_address, ...)
            DB-->>API: 유저 생성 완료
            API->>API: 세션 생성
            API-->>F: {sessionId, user, isNew: true}
            F->>F: 환영 팝업 표시<br/>"5,000 DEL 지급!"
        end
        F->>F: 세션 쿠키 저장
        F-->>U: 로그인 완료<br/>메인 페이지로 이동
    else 서명 무효
        API-->>F: 401 Unauthorized
        F-->>U: "로그인 실패" 알림
    end
```

**핵심 포인트**
1. 비밀번호 없음 → Sui 지갑 = 로그인
2. 서명 검증으로 소유권 증명
3. 신규 유저 자동 가입 + 초기 보상

---

## 베팅 플로우

### Happy Path (정상 베팅)

```mermaid
sequenceDiagram
    participant U as 유저
    participant F as Frontend
    participant W as Sui Wallet
    participant API as Next.js API
    participant DB as D1 Database
    participant S as Sui Blockchain

    Note over U,S: 1. 라운드 조회 (베팅 전)
    U->>F: 메인 페이지 접속
    F->>API: GET /api/rounds/current?type=6HOUR
    API->>DB: SELECT * FROM rounds<br/>WHERE type='6HOUR'<br/>AND status IN ('BETTING_OPEN', 'BETTING_LOCKED')
    DB-->>API: 현재 라운드 정보
    API-->>F: {round, canBet: true, timeRemaining: 45초}
    F-->>U: 라운드 정보 표시<br/>"금 vs 비트 예측하기"<br/>"베팅 마감: 45초"

    Note over U,S: 2. 베팅 시작
    U->>F: "금" 버튼 클릭
    F-->>U: 베팅 금액 입력 모달
    U->>F: 1,000 DEL 입력 → "베팅하기"
    
    F->>F: 유저 잔액 확인<br/>(delBalance >= 1000?)
    alt 잔액 부족
        F-->>U: "잔액이 부족합니다" 알림
    else 잔액 충분
        Note over U,S: 3. Sui 트랜잭션 생성
        F->>API: POST /api/bets/prepare<br/>{roundId, prediction: 'GOLD', amount: 1000}
        API->>DB: SELECT * FROM rounds WHERE id=?
        DB-->>API: 라운드 정보
        API->>API: 베팅 가능 여부 검증<br/>(status=BETTING_OPEN, now<lockTime)
        alt 베팅 불가
            API-->>F: 400 Bad Request<br/>"베팅이 마감되었습니다"
            F-->>U: 에러 알림
        else 베팅 가능
            API->>S: 트랜잭션 준비<br/>placeBet(poolId, prediction, amount)
            S-->>API: 트랜잭션 블록
            API-->>F: {tx: TransactionBlock}
            
            Note over U,S: 4. 유저 서명
            F->>W: signAndExecuteTransactionBlock(tx)
            W-->>U: 트랜잭션 승인 요청<br/>"1,000 DEL 베팅"
            U->>W: 승인
            W->>S: 트랜잭션 전송
            S->>S: place_bet() 실행<br/>- DEL Lock<br/>- Bet Object 생성
            S-->>W: {txHash, betObjectId}
            W-->>F: 트랜잭션 성공
            
            Note over U,S: 5. 백엔드 기록
            F->>API: POST /api/bets<br/>{roundId, prediction, amount,<br/>suiTxHash, suiBetObjectId}
            API->>S: getTransactionBlock(txHash)
            S-->>API: 트랜잭션 검증 OK
            
            API->>DB: BEGIN TRANSACTION
            API->>DB: INSERT INTO bets (...)<br/>VALUES (...)
            API->>DB: UPDATE rounds SET<br/>total_pool = total_pool + 1000,<br/>total_gold_bets = total_gold_bets + 1000
            API->>DB: INSERT INTO point_transactions<br/>(type='BET_PLACED', amount=-1000)
            API->>DB: UPDATE users SET<br/>del_balance = del_balance - 1000
            API->>DB: COMMIT
            DB-->>API: 저장 완료
            
            API->>API: WebSocket 브로드캐스트<br/>"bet:placed"
            API-->>F: {success: true, bet, round}
            
            F->>F: 로컬 상태 업데이트<br/>- 잔액: 5000 → 4000<br/>- 풀: 1,500,000 → 1,501,000
            F-->>U: 베팅 완료 애니메이션<br/>"베팅이 완료되었습니다!"
        end
    end
```

**타임라인 예상**
1. 라운드 조회: ~100ms
2. Sui 트랜잭션: ~1-2초 (지갑 서명 포함)
3. 백엔드 기록: ~200ms
4. **총 소요 시간**: ~2-3초

---

### 베팅 마감 직전 시나리오

```mermaid
sequenceDiagram
    participant U as 유저
    participant F as Frontend
    participant API as Next.js API
    participant DB as D1 Database

    Note over U,DB: T+00:00:55 (마감 5초 전)
    F->>F: setInterval 체크<br/>timeRemaining = 5초
    F->>F: 버튼 비활성화<br/>"베팅 마감 임박!"
    F-->>U: 빨간색 경고 표시

    Note over U,DB: T+00:00:58 (유저가 58초에 클릭)
    U->>F: "금" 버튼 클릭 (무시됨)
    F-->>U: "베팅이 곧 마감됩니다" 알림

    Note over U,DB: T+00:01:00 (Cron Job 실행)
    Note right of DB: Cron Job 3: Betting Locker
    DB->>DB: UPDATE rounds SET status='BETTING_LOCKED'<br/>WHERE status='BETTING_OPEN'<br/>AND lock_time <= now()

    API->>API: WebSocket 브로드캐스트<br/>"round:status_changed"
    API-->>F: {fromStatus: 'BETTING_OPEN',<br/>toStatus: 'BETTING_LOCKED'}
    
    F->>F: UI 업데이트
    F-->>U: "베팅이 마감되었습니다"<br/>버튼 완전 비활성화
```

---

## 정산 플로우

### 라운드 종료 및 배당 지급

```mermaid
sequenceDiagram
    participant C as Cron Job
    participant API as Next.js API
    participant P as Price API (현준)
    participant DB as D1 Database
    participant S as Sui Blockchain
    participant U as 유저들

    Note over C,U: T+6시간 (라운드 종료)
    C->>C: 스케줄러 트리거<br/>매 6시간 (20:00 KST)
    
    Note over C,U: 1. End Price 스냅샷
    C->>API: Cron Job 4: Round Finalizer
    API->>DB: SELECT * FROM rounds<br/>WHERE status='BETTING_LOCKED'<br/>AND end_time <= now()
    DB-->>API: 종료된 라운드 (round #42)
    
    API->>P: getPrices()
    P-->>API: {gold: 2655.20, btc: 98450.00}
    
    API->>DB: UPDATE rounds SET<br/>gold_end_price='2655.20',<br/>btc_end_price='98450.00',<br/>status='PRICE_PENDING'
    DB-->>API: 업데이트 완료
    
    Note over C,U: 2. 승자 판정
    API->>API: 변동률 계산<br/>gold: (2655.20-2650.50)/2650.50 = 0.18%<br/>btc: (98450-98234)/98234 = 0.22%
    API->>API: 승자 = BTC (0.22% > 0.18%)
    
    API->>DB: UPDATE rounds SET<br/>winner='BTC',<br/>status='CALCULATING'
    DB-->>API: 업데이트 완료
    
    Note over C,U: 3. Sui Settlement 생성
    API->>S: finalize_round(<br/>  gold_start, gold_end,<br/>  btc_start, btc_end,<br/>  platform_fee_rate=5<br/>)
    S->>S: Settlement Object 생성<br/>- winner = BTC<br/>- payout_ratio = 178 (1.78배)<br/>- platform_fee = 75,000
    S-->>API: {settlementId, payoutRatio: 178}
    
    API->>DB: INSERT INTO settlements<br/>(round_id, winner='BTC',<br/>payout_ratio='1.78', ...)
    DB-->>API: 저장 완료
    
    Note over C,U: 4. 승자 조회 및 배당
    API->>DB: SELECT * FROM bets<br/>WHERE round_id=42<br/>AND prediction='BTC'<br/>AND settlement_status='PENDING'
    DB-->>API: 65명의 승자
    
    loop 각 승자 (65명)
        API->>DB: SELECT bet WHERE id=?
        DB-->>API: {id, amount, userId, suiBetObjectId}
        
        API->>S: distribute_payout(<br/>  pool, settlement, bet<br/>)
        S->>S: 배당 계산<br/>payout = amount × 1.78
        S->>S: 승자에게 DEL 전송
        S-->>API: {payoutAmount: 1780}
        
        API->>DB: BEGIN TRANSACTION
        API->>DB: UPDATE bets SET<br/>settlement_status='WON',<br/>payout_amount=1780,<br/>settled_at=now()
        API->>DB: INSERT INTO point_transactions<br/>(type='BET_WON', amount=+1780)
        API->>DB: UPDATE users SET<br/>del_balance = del_balance + 1780
        API->>DB: COMMIT
        DB-->>API: 저장 완료
        
        Note right of API: WebSocket 알림
        API-->>U: "settlement:payout"<br/>{amount: 1780}
    end
    
    Note over C,U: 5. 정산 완료
    API->>DB: UPDATE rounds SET<br/>status='SETTLED',<br/>settlement_completed_at=now()
    DB-->>API: 완료
    
    API->>API: WebSocket 브로드캐스트<br/>"settlement:completed"
    API-->>U: {roundId: 42, winner: 'BTC',<br/>payoutRatio: '1.78'}
    
    Note over U: 유저 UI 업데이트<br/>"배당금 1,780 DEL 지급!"
```

**타임라인 예상**
1. End Price 스냅샷: ~1초
2. Sui Settlement 생성: ~2초
3. 배당 전송 (65명): ~65 × 2초 = 2분 10초
4. **총 소요 시간**: ~2-3분

---

### 무승부 (DRAW) 시나리오

```mermaid
sequenceDiagram
    participant C as Cron Job
    participant API as Next.js API
    participant DB as D1 Database
    participant S as Sui Blockchain
    participant U as 유저들

    Note over C,U: 변동률이 동일한 경우
    C->>API: Round Finalizer
    API->>API: 변동률 계산<br/>gold: 0.15%<br/>btc: 0.15% (동일!)
    API->>API: winner = DRAW
    
    API->>S: finalize_round(winner=3)
    S->>S: Settlement 생성<br/>payout_ratio = 100 (1.00배)
    S-->>API: settlementId
    
    API->>DB: SELECT * FROM bets<br/>WHERE round_id=42<br/>AND settlement_status='PENDING'
    DB-->>API: 모든 베팅 (150명)
    
    loop 모든 베팅자 (150명)
        API->>S: distribute_payout(환불)
        S->>S: 원금 반환 (amount × 1.00)
        S-->>API: {payoutAmount: amount}
        
        API->>DB: UPDATE bets SET<br/>settlement_status='REFUNDED',<br/>payout_amount=amount
        API->>DB: UPDATE users SET<br/>del_balance = del_balance + amount
        DB-->>API: 완료
        
        API-->>U: "무승부 환불"<br/>{amount: 원금}
    end
    
    API->>DB: UPDATE rounds SET<br/>status='VOIDED'
    DB-->>API: 완료
    
    Note over U: "무승부로 베팅 금액이 환불되었습니다"
```

---

## 출석 체크

### 일일 출석 보상

```mermaid
sequenceDiagram
    participant U as 유저
    participant F as Frontend
    participant API as Next.js API
    participant DB as D1 Database

    U->>F: 메인 페이지 접속
    F->>API: GET /api/users/me
    API->>DB: SELECT * FROM users WHERE id=?
    DB-->>API: {canAttendToday: true, attendanceStreak: 7}
    API-->>F: 유저 정보
    
    F-->>U: "출석 체크" 뱃지 표시<br/>(연속 7일)

    U->>F: "출석 체크" 버튼 클릭
    F->>API: POST /api/points/attendance
    
    API->>DB: SELECT last_attendance_at FROM users<br/>WHERE id=?
    DB-->>API: 마지막 출석: 어제
    
    API->>API: 검증<br/>- 오늘 출석 안 함?<br/>- 연속 출석 체크
    
    alt 오늘 이미 출석
        API-->>F: 400 ALREADY_ATTENDED
        F-->>U: "오늘 이미 출석했습니다"
    else 출석 가능
        API->>DB: BEGIN TRANSACTION
        API->>DB: INSERT INTO point_transactions<br/>(type='ATTENDANCE', amount=+5000)
        API->>DB: UPDATE users SET<br/>del_balance = del_balance + 5000,<br/>last_attendance_at = now(),<br/>attendance_streak = attendance_streak + 1
        API->>DB: COMMIT
        DB-->>API: 완료
        
        API-->>F: {reward: 5000, streak: 8}
        F->>F: 축하 애니메이션<br/>"5,000 DEL 지급!"
        F-->>U: "연속 8일 출석!<br/>5,000 DEL 획득"
    end
```

---

## NFT 구매

### NFT 상점 플로우 (김영민 담당)

```mermaid
sequenceDiagram
    participant U as 유저
    participant F as Frontend
    participant API as Next.js API
    participant DB as D1 Database
    participant S as Sui Blockchain
    participant IPFS as Pinata IPFS

    U->>F: NFT 상점 페이지 접속
    F->>API: GET /api/nfts/shop
    API->>DB: SELECT * FROM nft_templates<br/>WHERE available=true
    DB-->>API: NFT 목록 (A~E 티어)
    API-->>F: [{tier: 'A', price: 300000}, ...]
    F-->>U: NFT 카드 표시

    U->>F: "Cyber Dragon (A 티어)" 클릭
    F-->>U: 구매 확인 모달<br/>"300,000 DEL"

    U->>F: "구매하기" 클릭
    F->>API: POST /api/nfts/purchase<br/>{templateId, tier: 'A'}
    
    API->>DB: SELECT del_balance FROM users<br/>WHERE id=?
    DB-->>API: {delBalance: 500000}
    
    alt 잔액 부족
        API-->>F: 400 INSUFFICIENT_BALANCE
        F-->>U: "잔액이 부족합니다"
    else 잔액 충분
        Note over API,IPFS: 1. NFT 메타데이터 생성
        API->>IPFS: 이미지 업로드<br/>(cyber_dragon.png)
        IPFS-->>API: ipfs://Qm...
        
        API->>IPFS: 메타데이터 업로드<br/>{name, image, tier, ...}
        IPFS-->>API: ipfs://Qm... (metadata)
        
        Note over API,S: 2. Sui NFT 민팅
        API->>S: mint_nft(<br/>  user_address,<br/>  metadata_url,<br/>  tier<br/>)
        S->>S: NFT Object 생성
        S-->>API: {nftObjectId}
        
        Note over API,DB: 3. D1 기록
        API->>DB: BEGIN TRANSACTION
        API->>DB: INSERT INTO achievements<br/>(user_id, type='NFT', tier='A',<br/>sui_nft_object_id, ipfs_metadata_url, ...)
        API->>DB: INSERT INTO point_transactions<br/>(type='NFT_PURCHASE', amount=-300000)
        API->>DB: UPDATE users SET<br/>del_balance = del_balance - 300000
        API->>DB: COMMIT
        DB-->>API: 완료
        
        API-->>F: {success: true, nft}
        F->>F: 축하 효과<br/>"Legendary NFT 획득!"
        F-->>U: NFT 획득 애니메이션<br/>"Cyber Dragon (A 티어)"
    end
```

---

## 에러 시나리오

### 1. 네트워크 에러 (Sui 트랜잭션 실패)

```mermaid
sequenceDiagram
    participant U as 유저
    participant F as Frontend
    participant W as Sui Wallet
    participant S as Sui Blockchain

    U->>F: 베팅 시도
    F->>W: signAndExecuteTransactionBlock(tx)
    W->>S: 트랜잭션 전송
    
    alt Sui RPC 타임아웃
        S-->>W: 타임아웃 (30초 초과)
        W-->>F: Error: Transaction timeout
        F->>F: 재시도 로직<br/>(최대 3회)
        
        loop 재시도 (최대 3회)
            F->>W: 트랜잭션 재전송
            W->>S: 전송
            alt 성공
                S-->>W: {txHash}
                W-->>F: 성공
            else 계속 실패
                S-->>W: 타임아웃
            end
        end
        
        alt 3회 모두 실패
            F-->>U: "블록체인 네트워크 오류<br/>잠시 후 다시 시도해주세요"
        end
    else 가스비 부족 (SUI 없음)
        S-->>W: Error: Insufficient gas
        W-->>F: Gas error
        F-->>U: "시스템 오류가 발생했습니다<br/>(관리자에게 문의)"
        Note right of F: Admin에게 알림<br/>(SUI 잔액 충전 필요)
    end
```

### 2. 베팅 마감 후 요청 (Race Condition)

```mermaid
sequenceDiagram
    participant U as 유저
    participant F as Frontend
    participant API as Next.js API
    participant DB as D1 Database

    Note over U,DB: T+00:00:59 (마감 1초 전)
    U->>F: "금" 버튼 클릭
    F->>F: canBet 확인 (OK)
    F->>API: POST /api/bets/prepare

    Note over DB: T+00:01:00 (Cron Job 실행)
    DB->>DB: UPDATE rounds SET<br/>status='BETTING_LOCKED'

    API->>DB: SELECT * FROM rounds WHERE id=?
    DB-->>API: {status: 'BETTING_LOCKED'}
    
    API->>API: 베팅 가능 검증<br/>status != BETTING_OPEN
    API-->>F: 400 BETTING_CLOSED<br/>"베팅이 마감되었습니다"
    
    F-->>U: "베팅 시간이 종료되었습니다"<br/>(자동으로 UI 업데이트)
```

### 3. D1 저장 실패 (Sui 성공 후)

```mermaid
sequenceDiagram
    participant F as Frontend
    participant API as Next.js API
    participant DB as D1 Database
    participant S as Sui Blockchain
    participant Slack as Slack 알림

    F->>API: POST /api/bets
    API->>S: place_bet()
    S-->>API: {txHash, betObjectId} ✅
    
    API->>DB: INSERT INTO bets (...)
    DB-->>API: ❌ DB Connection Error
    
    API->>API: Sui는 성공했으므로<br/>복구 큐에 추가
    API->>API: Recovery Queue.add({<br/>  type: 'BET_SYNC',<br/>  txHash, betObjectId<br/>})
    
    API->>Slack: 알림 전송<br/>"베팅 Sui 성공, D1 저장 실패"
    
    API-->>F: {success: true,<br/>warning: '기록 동기화 지연 중'}
    F-->>F: "베팅이 완료되었습니다<br/>(기록 동기화 중)"
    
    Note over API: 백그라운드 복구
    loop Recovery Job (1분마다)
        API->>API: Recovery Queue.process()
        API->>S: getTransactionBlock(txHash)
        S-->>API: 트랜잭션 정보
        API->>DB: INSERT INTO bets (...)<br/>(재시도)
        alt 성공
            DB-->>API: 저장 완료
            API->>API: Queue에서 제거
        else 실패
            API->>API: 재시도 횟수 증가
            alt 10회 실패
                API->>Slack: 알림: 수동 개입 필요
            end
        end
    end
```

---

## 요약

### 주요 플로우 소요 시간

| 플로우              | 예상 시간     | 병목 지점           |
| ------------------- | ------------- | ------------------- |
| 로그인              | ~2-3초        | Sui 지갑 서명       |
| 베팅 (정상)         | ~2-3초        | Sui 트랜잭션        |
| 정산 (65명 기준)    | ~2-3분        | 배당 전송 (루프)    |
| 출석 체크           | ~500ms        | D1 트랜잭션         |
| NFT 구매            | ~3-4초        | IPFS 업로드 + Sui   |

### UX 최적화 전략

1. **로딩 인디케이터**: 모든 Sui 트랜잭션 시 표시
2. **낙관적 업데이트**: 베팅 후 즉시 UI 업데이트 (백엔드 응답 기다리지 않음)
3. **WebSocket 실시간 업데이트**: 풀 변화, 베팅 현황
4. **에러 복구**: 자동 재시도 + 복구 큐

### 다이어그램 활용

- **개발자**: 구현 시 참고
- **테스터**: 시나리오 기반 테스트
- **PM**: 사용자 경험 이해

---
