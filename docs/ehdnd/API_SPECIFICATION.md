# API_SPECIFICATION.md

deltaX 베팅 시스템의 REST API 엔드포인트 명세

---

## 📋 목차

1. [개요](#개요)
2. [인증 및 권한](#인증-및-권한)
3. [공통 응답 포맷](#공통-응답-포맷)
4. [Rounds API](#rounds-api)
5. [Bets API](#bets-api)
6. [Users API](#users-api)
7. [Settlements API](#settlements-api)
8. [Points API](#points-api)
9. [Admin API](#admin-api)
10. [Cron Job API](#cron-job-api)
11. [WebSocket Events](#websocket-events)
12. [에러 코드](#에러-코드)

---

## 개요

### API 기본 정보

**Base URL**
- 개발: `http://localhost:3000/api`
- 프로덕션: `https://deltax.app/api`

**Content-Type**
```
Content-Type: application/json
```

**Timestamp 형식**
- 모든 timestamp는 **Epoch milliseconds** (밀리초 단위)
- 1970-01-01 00:00:00 UTC 이후 경과한 밀리초
- JavaScript Date와 직접 호환: `new Date(timestamp)`
- 예시: `1700000000000` (2023년 11월 15일)
- 클라이언트에서 로컬 타임존 변환

### API 카테고리

| 카테고리   | 책임자 | 설명                     |
| ---------- | ------ | ------------------------ |
| `/rounds`  | 태웅   | 라운드 조회, 생성        |
| `/bets`    | 태웅   | 베팅 생성, 조회          |
| `/users`   | 도영   | 유저 정보, 랭킹          |
| `/points`  | 도영   | 재화 관리, 출석          |
| `/nfts`    | 영민   | NFT 조회, 구매           |
| `/shop`    | 영민   | 상점 아이템              |
| `/prices`  | 현준   | 실시간 가격 데이터       |
| `/admin`   | 태웅   | 관리자 전용              |
| `/cron`    | 태웅   | Cron Job 전용 (내부)     |

---

## 인증 및 권한

### Sui 지갑 기반 인증

**1. 세션 생성**
```http
POST /api/auth/session
Content-Type: application/json

{
  "suiAddress": "0x742d...",
  "signature": "...",      # 서명으로 소유권 증명
  "message": "Login to DeltaX"
}

Response:
{
  "success": true,
  "sessionId": "session_uuid",
  "expiresAt": 1700000000000
}
```

**2. 요청 시 세션 포함**
```http
GET /api/users/me
Cookie: session=session_uuid

# 또는
Authorization: Bearer session_uuid
```

### 권한 레벨

| 레벨    | 권한                            |
| ------- | ------------------------------- |
| `USER`  | 일반 유저 (베팅, 조회)          |
| `ADMIN` | 관리자 (라운드 관리, 정산 조작) |

---

## 공통 응답 포맷

### 성공 응답

```typescript
{
  "success": true,
  "data": {
    // 엔드포인트별 데이터
  },
  "meta"?: {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

### 에러 응답

```typescript
{
  "success": false,
  "error": {
    "code": "BETTING_CLOSED",
    "message": "베팅이 마감되었습니다",
    "details"?: {
      "roundId": "uuid",
      "currentStatus": "BETTING_LOCKED"
    }
  }
}
```

---

## Rounds API

### 1. GET /api/rounds

**목적**: 라운드 목록 조회

**Query Parameters**
```typescript
{
  type?: '1MIN' | '6HOUR' | '1DAY',     // 필터: 라운드 타입
  status?: RoundStatus[],               // 필터: 상태 (복수 가능)
  page?: number,                        // 페이지 (기본: 1)
  pageSize?: number,                    // 페이지 크기 (기본: 20, 최대: 100)
  sort?: 'start_time' | 'round_number', // 정렬 기준
  order?: 'asc' | 'desc'                // 정렬 순서 (기본: desc)
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "rounds": [
      {
        "id": "uuid",
        "roundNumber": 42,
        "type": "6HOUR",
        "status": "BETTING_OPEN",
        "startTime": 1700000000000,
        "endTime": 1700021600000,
        "lockTime": 1700000060000,
        
        // 가격 정보 (있는 경우)
        "goldStartPrice": "2650.50",
        "btcStartPrice": "98234.00",
        "goldEndPrice": null,
        "btcEndPrice": null,
        
        // 풀 정보
        "totalPool": 1500000,
        "totalGoldBets": 800000,
        "totalBtcBets": 700000,
        "totalBetsCount": 150,
        
        // 승자 (정산 후)
        "winner": null,
        
        // 타임스탬프
        "createdAt": 1699999400000,
        "updatedAt": 1700000001000
      }
      // ... more rounds
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 500,
    "totalPages": 25
  }
}
```

**사용 예시**
```bash
# 현재 진행 중인 6시간 라운드
GET /api/rounds?type=6HOUR&status=BETTING_OPEN,BETTING_LOCKED&pageSize=10

# 최근 정산 완료된 라운드
GET /api/rounds?status=SETTLED&sort=start_time&order=desc&pageSize=20
```

---

### 2. GET /api/rounds/current

**목적**: 현재 활성 라운드 조회 (UI에서 가장 많이 사용)

**Query Parameters**
```typescript
{
  type: '1MIN' | '6HOUR' | '1DAY'   // 필수
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roundNumber": 42,
      "type": "6HOUR",
      "status": "BETTING_OPEN",
      
      // 시간 정보
      "startTime": 1700000000000,
      "endTime": 1700021600000,
      "lockTime": 1700000060000,
      "timeRemaining": 21540,        // 종료까지 남은 초 (초 단위)
      "bettingTimeRemaining": 45,    // 베팅 마감까지 남은 초
      
      // 가격
      "goldStartPrice": "2650.50",
      "btcStartPrice": "98234.00",
      "currentGoldPrice": "2655.30", // 현재 가격 (실시간)
      "currentBtcPrice": "98450.00",
      
      // 풀
      "totalPool": 1500000,
      "totalGoldBets": 800000,
      "totalBtcBets": 700000,
      "totalBetsCount": 150,
      
      // 승률 표시용
      "goldBetsPercentage": "53.33",  // 금 베팅 비율
      "btcBetsPercentage": "46.67",   // BTC 베팅 비율
      
      // UI용 정보
      "canBet": true,                 // 베팅 가능 여부
      "bettingClosesIn": "00:00:45",  // "MM:SS" 형식
      
      "createdAt": 1699999400000,
      "updatedAt": 1700000001000
    }
  }
}
```

**에러 케이스**
```typescript
// 현재 활성 라운드 없음
{
  "success": false,
  "error": {
    "code": "NO_ACTIVE_ROUND",
    "message": "현재 진행 중인 라운드가 없습니다"
  }
}
```

---

### 3. GET /api/rounds/:id

**목적**: 특정 라운드 상세 조회

**Path Parameters**
```typescript
{
  id: string  // 라운드 UUID
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "round": {
      // ... (GET /api/rounds/current와 동일한 구조)
      
      // 추가: 정산 정보 (status=SETTLED인 경우)
      "settlement": {
        "winner": "GOLD",
        "platformFee": 75000,
        "payoutPool": 1425000,
        "payoutRatio": "1.78",
        "totalWinners": 85,
        "totalLosers": 65,
        "settledAt": 1700021630
      },
      
      // 추가: 변동률 (종료 후)
      "goldChangePercent": "0.18",    // 0.18% 상승
      "btcChangePercent": "0.22"      // 0.22% 상승
    }
  }
}
```

---

### 4. POST /api/rounds (Admin)

**목적**: 새 라운드 생성 (수동)

**Request Body**
```typescript
{
  "type": "6HOUR",
  "startTime": 1700000000000,    // Epoch milliseconds
  "endTime": 1700021600000,
  "lockTime": 1700000060000
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roundNumber": 43,
      "status": "SCHEDULED",
      // ...
    }
  }
}
```

---

## Bets API

### 1. POST /api/bets

**목적**: 베팅 생성

**Request Body**
```typescript
{
  "roundId": "uuid",
  "prediction": "GOLD" | "BTC",
  "amount": 1000,                   // 베팅 금액 (정수)
  "currency": "DEL" | "CRYSTAL",
  
  // Sui 트랜잭션 정보
  "suiTxHash": "0x...",             // 베팅 트랜잭션 해시
  "suiBetObjectId": "0x..."         // Bet Object ID
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "bet": {
      "id": "uuid",
      "roundId": "uuid",
      "userId": "uuid",
      "prediction": "GOLD",
      "amount": 1000,
      "currency": "DEL",
      "settlementStatus": "PENDING",
      "payoutAmount": 0,
      
      "suiBetObjectId": "0x...",
      "suiTxHash": "0x...",
      
      "createdAt": 1700000030000,
      "processedAt": 1700000031000
    },
    
    // 업데이트된 라운드 정보
    "round": {
      "totalPool": 1501000,       // 베팅 후 풀
      "totalGoldBets": 801000,
      "totalBtcBets": 700000,
      "totalBetsCount": 151
    },
    
    // 유저 잔액
    "userBalance": {
      "delBalance": 4000,         // 베팅 후 잔액
      "crystalBalance": 0
    }
  }
}
```

**Validation 규칙**
1. 라운드 상태 = `BETTING_OPEN`
2. 현재 시각 < `lockTime`
3. 유저 잔액 >= 베팅 금액
4. amount >= 최소 베팅액 (예: 100)
5. Sui 트랜잭션 성공 확인

**에러 케이스**
```typescript
// 베팅 마감
{
  "success": false,
  "error": {
    "code": "BETTING_CLOSED",
    "message": "베팅이 마감되었습니다",
    "details": {
      "roundStatus": "BETTING_LOCKED",
      "lockedAt": 1700000060000
    }
  }
}

// 잔액 부족
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "잔액이 부족합니다",
    "details": {
      "required": 1000,
      "available": 500
    }
  }
}

// Sui 트랜잭션 실패
{
  "success": false,
  "error": {
    "code": "SUI_TX_FAILED",
    "message": "블록체인 트랜잭션이 실패했습니다",
    "details": {
      "suiTxHash": "0x...",
      "reason": "Insufficient gas"
    }
  }
}
```

---

### 2. GET /api/bets

**목적**: 베팅 목록 조회

**Query Parameters**
```typescript
{
  roundId?: string,                 // 필터: 특정 라운드
  userId?: string,                  // 필터: 특정 유저
  prediction?: 'GOLD' | 'BTC',      // 필터: 예측
  settlementStatus?: SettlementStatus[],
  page?: number,
  pageSize?: number
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "bets": [
      {
        "id": "uuid",
        "roundId": "uuid",
        "userId": "uuid",
        "userAddress": "0x742d...",   // Sui 주소
        "nickname": "Player123",
        
        "prediction": "GOLD",
        "amount": 1000,
        "currency": "DEL",
        
        "settlementStatus": "WON",
        "payoutAmount": 1780,          // 배당금
        
        "createdAt": 1700000030000,
        "settledAt": 1700021631000
      }
      // ...
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150
  }
}
```

**사용 예시**
```bash
# 특정 라운드의 모든 베팅
GET /api/bets?roundId=uuid&pageSize=100

# 특정 유저의 베팅 이력
GET /api/bets?userId=uuid&page=1&pageSize=20

# 승리한 베팅만
GET /api/bets?roundId=uuid&settlementStatus=WON
```

---

### 3. GET /api/bets/:id

**목적**: 특정 베팅 상세 조회

**Response**
```typescript
{
  "success": true,
  "data": {
    "bet": {
      // ... (GET /api/bets와 동일)
      
      // 추가: 라운드 정보
      "round": {
        "id": "uuid",
        "roundNumber": 42,
        "type": "6HOUR",
        "status": "SETTLED",
        "winner": "GOLD",
        "startTime": 1700000000,
        "endTime": 1700021600
      }
    }
  }
}
```

---

## Users API

### 1. GET /api/users/me

**목적**: 현재 로그인한 유저 정보

**Response**
```typescript
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "suiAddress": "0x742d...",
      "nickname": "Player123",
      "profileColor": "#3B82F6",
      
      // 재화
      "delBalance": 5000,
      "crystalBalance": 0,
      
      // 통계
      "totalBets": 42,
      "totalWins": 25,
      "totalVolume": 50000,
      "winRate": "59.52",         // 승률 (%)
      
      // 출석
      "lastAttendanceAt": 1700000000,
      "attendanceStreak": 7,      // 연속 출석일
      "canAttendToday": false,    // 오늘 출석 가능 여부
      
      // 타임스탬프
      "createdAt": 1699000000000,
      "updatedAt": 1700000001000
    }
  }
}
```

---

### 2. GET /api/users/:id

**목적**: 특정 유저 정보 조회 (공개 정보만)

**Response**
```typescript
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "suiAddress": "0x742d...",  // 일부만 표시 (0x742d...8f3a)
      "nickname": "Player123",
      "profileColor": "#3B82F6",
      
      // 공개 통계만
      "totalBets": 42,
      "totalWins": 25,
      "winRate": "59.52",
      
      // 재화는 비공개
      // delBalance, crystalBalance 없음
    }
  }
}
```

---

### 3. PATCH /api/users/me

**목적**: 프로필 업데이트

**Request Body**
```typescript
{
  "nickname"?: string,            // 최대 20자
  "profileColor"?: string         // HEX 색상 (#RRGGBB)
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "user": {
      // ... 업데이트된 유저 정보
    }
  }
}
```

---

### 4. GET /api/users/ranking

**목적**: 유저 랭킹 (김도영 담당)

**Query Parameters**
```typescript
{
  type: 'volume' | 'winRate' | 'streak',  // 랭킹 기준
  period?: 'day' | 'week' | 'month' | 'all',
  page?: number,
  pageSize?: number
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "rankings": [
      {
        "rank": 1,
        "userId": "uuid",
        "nickname": "TopPlayer",
        "suiAddress": "0x742d...",
        
        // 랭킹 기준에 따라 변동
        "totalVolume": 1000000,   // type=volume
        "winRate": "75.50",       // type=winRate
        "attendanceStreak": 30,   // type=streak
        
        "totalBets": 500,
        "totalWins": 377
      }
      // ...
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 100,
    "total": 5000
  }
}
```

---

## Settlements API

### 1. GET /api/settlements/:roundId

**목적**: 라운드 정산 정보 조회

**Response**
```typescript
{
  "success": true,
  "data": {
    "settlement": {
      "id": "uuid",
      "roundId": "uuid",
      
      // 승자 정보
      "winner": "GOLD",
      "totalPool": 1500000,
      "winningPool": 800000,
      "losingPool": 700000,
      
      // 수수료 및 배당
      "platformFee": 75000,         // 5%
      "payoutPool": 1425000,
      "payoutRatio": "1.78",        // 승자 1명당 1.78배
      
      // 통계
      "totalWinners": 85,
      "totalLosers": 65,
      
      // Sui
      "suiSettlementObjectId": "0x...",
      
      // 타임스탬프
      "calculatedAt": 1700021620000,
      "completedAt": 1700021630000,
      "createdAt": 1700021620000
    },
    
    // 추가: 라운드 정보
    "round": {
      "id": "uuid",
      "roundNumber": 42,
      "type": "6HOUR",
      "goldStartPrice": "2650.50",
      "goldEndPrice": "2655.20",
      "btcStartPrice": "98234.00",
      "btcEndPrice": "98450.00",
      "goldChangePercent": "0.18",
      "btcChangePercent": "0.22"
    }
  }
}
```

---

## Points API

### 1. POST /api/points/attendance

**목적**: 출석 체크 (김도영 담당)

**Response**
```typescript
{
  "success": true,
  "data": {
    "reward": 5000,               // 지급된 del
    "attendanceStreak": 8,        // 연속 출석일
    "nextAttendanceAt": 1700086400000,  // 다음 출석 가능 시각
    
    "transaction": {
      "id": "uuid",
      "type": "ATTENDANCE",
      "amount": 5000,
      "balanceBefore": 10000,
      "balanceAfter": 15000,
      "createdAt": 1700000000000
    }
  }
}
```

**에러 케이스**
```typescript
// 이미 출석함
{
  "success": false,
  "error": {
    "code": "ALREADY_ATTENDED",
    "message": "오늘 이미 출석했습니다",
    "details": {
      "lastAttendanceAt": 1700000000000,
      "nextAttendanceAt": 1700086400000
    }
  }
}
```

---

### 2. GET /api/points/transactions

**목적**: 재화 거래 이력

**Query Parameters**
```typescript
{
  userId?: string,
  type?: TransactionType[],
  currency?: 'DEL' | 'CRYSTAL',
  page?: number,
  pageSize?: number
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "userId": "uuid",
        "type": "BET_WON",
        "currency": "DEL",
        "amount": 1780,             // 양수 = 증가
        "balanceBefore": 5000,
        "balanceAfter": 6780,
        "referenceId": "bet_uuid",
        "referenceType": "BET",
        "description": "라운드 #42 승리",
        "createdAt": 1700021631000
      },
      {
        "id": "uuid",
        "userId": "uuid",
        "type": "BET_PLACED",
        "currency": "DEL",
        "amount": -1000,            // 음수 = 감소
        "balanceBefore": 6780,
        "balanceAfter": 5780,
        "referenceId": "bet_uuid2",
        "referenceType": "BET",
        "description": "라운드 #43 베팅",
        "createdAt": 1700025000000
      }
      // ...
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150
  }
}
```

---

## Admin API

### 1. POST /api/admin/rounds/settle

**목적**: 수동 정산 트리거

**Request Body**
```typescript
{
  "roundId": "uuid"
}
```

**Response**
```typescript
{
  "success": true,
  "data": {
    "settlement": {
      // ... (GET /api/settlements/:roundId와 동일)
    }
  }
}
```

---

### 2. POST /api/admin/rounds/:id/cancel

**목적**: 라운드 취소 및 환불

**Response**
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "status": "CANCELLED",
      "updatedAt": 1700000000000
    },
    "refundedBets": 150,          // 환불된 베팅 수
    "refundedAmount": 1500000     // 환불된 총 금액
  }
}
```

---

## Cron Job API

**⚠️ 중요: 내부 전용 API**

이 엔드포인트들은 **Cloudflare Workers Cron에서만 호출**됩니다.
외부 접근 불가 (Cron Secret 인증 필수)

### 인증 방식

모든 Cron Job API는 `X-Cron-Secret` 헤더를 검증합니다.

```http
POST /api/cron/rounds/create
X-Cron-Secret: <CRON_SECRET 환경 변수>
Content-Type: application/json
```

**검증 실패 시:**
```typescript
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid cron secret"
  }
}
// HTTP Status: 401
```

---

### 1. POST /api/cron/rounds/create

**목적**: 다음 라운드 자동 생성 (T-10분)

**실행 시각**: 라운드 시작 10분 전
- 01:50, 07:50, 13:50, 19:50 KST
- 16:50, 22:50, 04:50, 10:50 UTC

**Cron 표현식**:
```
"50 16,22,4,10 * * *"
```

**Request Body**: 없음 (자동 계산)

**Response**:
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roundNumber": 43,
      "type": "6HOUR",
      "status": "SCHEDULED",
      "startTime": 1700000000000,   // T+10분 후
      "endTime": 1700021600000,     // startTime + 6시간
      "lockTime": 1700000060000,    // startTime + 1분
      "createdAt": 1699999400000
    }
  }
}
```

**처리 로직**:
1. 마지막 라운드 조회 (가장 최근 생성된 라운드)
2. 다음 시작 시각 계산 (`lastRound.startTime + 6시간`)
3. `rounds` 테이블에 INSERT
4. `status = 'SCHEDULED'`
5. WebSocket 발행: `round:created`

**에러 케이스**:
```typescript
// 중복 라운드 (이미 같은 시각에 라운드 존재)
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ROUND",
    "message": "Round already exists for this time slot",
    "details": {
      "existingRoundId": "uuid",
      "startTime": 1700000000000
    }
  }
}
```

**재시도 정책**: 3회 재시도, 실패 시 Slack 알림

---

### 2. POST /api/cron/rounds/open

**목적**: 라운드 시작 및 베팅 활성화 (T+0)

**실행 시각**: 라운드 시작 시각
- 02:00, 08:00, 14:00, 20:00 KST
- 17:00, 23:00, 05:00, 11:00 UTC

**Cron 표현식**:
```
"0 17,23,5,11 * * *"
```

**Request Body**: 없음 (자동 처리)

**Response**:
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "roundNumber": 43,
      "status": "BETTING_OPEN",        // ✅ 변경됨

      // Start Price 스냅샷 완료
      "goldStartPrice": "2650.50",
      "btcStartPrice": "98234.00",
      "priceSnapshotStartAt": "2025-11-15T05:00:00.500Z",
      "startPriceSource": "kitco",
      "startPriceIsFallback": false,

      // Sui BettingPool 생성 완료
      "suiPoolAddress": "0x123abc...",

      "bettingOpenedAt": 1700000000000,
      "updatedAt": 1700000000500
    }
  }
}
```

**처리 로직**:
1. `SCHEDULED` 상태이고 `startTime <= NOW` 인 라운드 찾기
2. **Start Price 스냅샷**:
   ```typescript
   const prices = await getPrices(); // 현준님 API
   // { gold: 2650.50, btc: 98234.00, timestamp: Date, source: 'kitco' }
   ```
3. 가격 검증 (`validatePrice()`)
4. **Sui BettingPool 생성**:
   ```typescript
   const poolAddress = await suiClient.call({
     target: `${PACKAGE_ID}::betting::create_pool`,
     arguments: [roundId, startTime, endTime]
   });
   ```
5. DB 업데이트:
   - `status = 'BETTING_OPEN'`
   - `gold_start_price`, `btc_start_price` 저장
   - `sui_pool_address` 저장
   - `betting_opened_at = NOW`
6. WebSocket 발행: `round:status_changed`

**Fallback 처리** (가격 API 실패 시):
```typescript
// 시나리오 1: Redis 캐시 사용
{
  "goldStartPrice": "2650.50",  // 캐시된 가격
  "startPriceIsFallback": true,
  "startPriceFallbackReason": "REDIS_CACHE",
  "startPriceSource": "redis"
}

// 시나리오 2: 라운드 지연
{
  "success": true,
  "data": {
    "round": {
      "status": "DELAYED",  // 임시 상태
      "delayReason": "PRICE_API_TIMEOUT"
    }
  }
}

// 시나리오 3: Critical Failure
{
  "success": false,
  "error": {
    "code": "PRICE_FETCH_FAILED",
    "message": "가격 조회 3회 실패, 라운드 취소 필요"
  }
}
```

**에러 케이스**:
```typescript
// SCHEDULED 라운드 없음
{
  "success": false,
  "error": {
    "code": "NO_SCHEDULED_ROUND",
    "message": "No scheduled round found for opening"
  }
}

// Sui Pool 생성 실패
{
  "success": false,
  "error": {
    "code": "SUI_POOL_CREATION_FAILED",
    "message": "Failed to create Sui BettingPool",
    "details": {
      "roundId": "uuid",
      "suiError": "Insufficient gas"
    }
  }
}
```

---

### 3. POST /api/cron/rounds/lock

**목적**: 베팅 마감 (T+1분)

**실행 시각**: 라운드 시작 1분 후
- 02:01, 08:01, 14:01, 20:01 KST
- 17:01, 23:01, 05:01, 11:01 UTC

**Cron 표현식**:
```
"1 17,23,5,11 * * *"
```

**Request Body**: 없음

**Response**:
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "status": "BETTING_LOCKED",  // ✅ 변경됨

      // 최종 베팅 풀 (더 이상 변경 안 됨)
      "totalPool": 1500000,
      "totalGoldBets": 800000,
      "totalBtcBets": 700000,
      "totalBetsCount": 150,

      "bettingLockedAt": 1700000060000,
      "updatedAt": 1700000060100
    }
  }
}
```

**처리 로직**:
1. `BETTING_OPEN` 상태이고 `lockTime <= NOW` 인 라운드 찾기
2. DB 업데이트:
   - `status = 'BETTING_LOCKED'`
   - `betting_locked_at = NOW`
3. **Sui Pool 잠금** (선택적, Week 2+):
   ```typescript
   await suiClient.call({
     target: `${PACKAGE_ID}::betting::lock_pool`,
     arguments: [poolAddress]
   });
   ```
4. WebSocket 발행: `round:status_changed`

**에러 케이스**:
```typescript
// BETTING_OPEN 라운드 없음
{
  "success": false,
  "error": {
    "code": "NO_OPEN_ROUND",
    "message": "No open round found for locking"
  }
}
```

---

### 4. POST /api/cron/rounds/finalize

**목적**: 라운드 종료 및 승자 판정 (T+6시간)

**실행 시각**: 라운드 종료 시각 (= 다음 라운드 시작 시각)
- 02:00, 08:00, 14:00, 20:00 KST

**Cron 표현식**: Job 2와 동일 (같은 시각에 실행)
```
"0 17,23,5,11 * * *"
```

**Request Body**: 없음

**Response**:
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "status": "CALCULATING",  // ✅ 변경됨

      // End Price 스냅샷 완료
      "goldStartPrice": "2650.50",
      "btcStartPrice": "98234.00",
      "goldEndPrice": "2680.20",      // ✅ 새로 추가
      "btcEndPrice": "99500.00",      // ✅ 새로 추가
      "priceSnapshotEndAt": "2025-11-15T11:00:01Z",

      // 승자 판정 완료
      "winner": "BTC",                // ✅ 결정됨
      "goldChangePercent": "1.12",    // (2680.20 - 2650.50) / 2650.50
      "btcChangePercent": "1.29",     // (99500 - 98234) / 98234

      // 배당 계산 완료
      "platformFee": 75000,           // 5%
      "payoutPool": 1425000,          // total - fee
      "payoutRatio": "2.0357",        // payoutPool / winningPool

      "roundEndedAt": 1700021600000,
      "settlementStartedAt": 1700021601000,
      "updatedAt": 1700021601500
    }
  }
}
```

**처리 로직**:
1. `BETTING_LOCKED` 상태이고 `endTime <= NOW` 인 라운드 찾기
2. **End Price 스냅샷**:
   ```typescript
   const prices = await getPrices();
   ```
3. 상태 전이: `BETTING_LOCKED → PRICE_PENDING`
4. 가격 스냅샷 성공 시 즉시 계속:
   - 승자 판정:
     ```typescript
     const goldChange = (goldEnd - goldStart) / goldStart;
     const btcChange = (btcEnd - btcStart) / btcStart;

     if (Math.abs(goldChange - btcChange) < 0.0001) {
       winner = 'DRAW';  // 무승부 (0.01% 이내)
     } else if (goldChange > btcChange) {
       winner = 'GOLD';
     } else {
       winner = 'BTC';
     }
     ```
   - 배당 계산
   - 상태 전이: `PRICE_PENDING → CALCULATING`
5. WebSocket 발행: `round:finalized`

**Fallback 처리** (End Price 실패):
```typescript
// Fallback 사용
{
  "goldEndPrice": "2680.20",
  "endPriceIsFallback": true,
  "endPriceFallbackReason": "REDIS_CACHE"
}

// Critical Failure → 라운드 취소
{
  "success": false,
  "error": {
    "code": "END_PRICE_FETCH_FAILED",
    "message": "가격 조회 실패, 라운드 취소 처리 중"
  }
}
// 이 경우 status = 'CANCELLED'로 전환하고 전액 환불
```

**에러 케이스**:
```typescript
// BETTING_LOCKED 라운드 없음
{
  "success": false,
  "error": {
    "code": "NO_LOCKED_ROUND",
    "message": "No locked round found for finalization"
  }
}
```

---

### 5. POST /api/cron/rounds/settle

**목적**: 정산 처리 및 배당 지급 (비동기)

**실행 방식**: Job 4가 라운드를 `CALCULATING`으로 변경한 직후 자동 트리거

**Cron 표현식**: 없음 (이벤트 기반)

**Request Body**:
```typescript
{
  "roundId": "uuid"  // 정산할 라운드 ID
}
```

**Response**:
```typescript
{
  "success": true,
  "data": {
    "round": {
      "id": "uuid",
      "status": "SETTLED",  // ✅ 최종 상태

      "winner": "BTC",
      "totalWinners": 65,
      "totalLosers": 85,

      // Sui Settlement Object
      "suiSettlementObjectId": "0xdef456...",

      "settlementCompletedAt": 1700021630000,
      "updatedAt": 1700021630500
    },
    "settledBets": 150,  // 정산 완료된 베팅 수
    "payoutsSent": 65    // 배당 전송 완료 수
  }
}
```

**처리 로직**:

**시나리오 A: 정상 정산 (승자 있음)**
```typescript
1. CALCULATING 라운드 조회
2. 승자 베팅 목록 조회:
   SELECT * FROM bets
   WHERE round_id = ? AND prediction = winner

3. Sui Settlement Object 생성:
   await suiClient.call({
     target: `${PACKAGE_ID}::settlement::finalize_round`,
     arguments: [roundId, winner, totalPool, payoutPool]
   });

4. 각 승자에게 배당 전송 (루프):
   FOR EACH winningBet:
     const payout = (bet.amount / winningPool) * payoutPool;

     await suiClient.call({
       target: `${PACKAGE_ID}::settlement::distribute_payout`,
       arguments: [betObjectId, userAddress, payout]
     });

     // D1 업데이트
     UPDATE bets SET
       settlement_status = 'COMPLETED',
       result_status = 'WON',
       payout_amount = payout,
       sui_payout_tx_hash = txHash,
       settled_at = NOW
     WHERE id = bet.id;

5. 패자 처리 (Sui 전송 없이 상태만 업데이트):
   UPDATE bets SET
     settlement_status = 'COMPLETED',
     result_status = 'LOST',
     payout_amount = 0,
     settled_at = NOW
   WHERE round_id = ? AND prediction != winner;

6. 라운드 최종 상태 업데이트:
   UPDATE rounds SET
     status = 'SETTLED',
     settlement_completed_at = NOW
   WHERE id = ?;

7. WebSocket 발행: settlement:completed
```

**시나리오 B: 무승부 (DRAW)**
```typescript
1. 전액 환불 (수수료 없음)
   FOR EACH bet:
     const refund = bet.amount;  // 원금 그대로

     await suiClient.call({
       target: `${PACKAGE_ID}::betting::unlock_bet`,
       arguments: [betObjectId, userAddress, refund]
     });

     UPDATE bets SET
       settlement_status = 'COMPLETED',
       result_status = 'REFUNDED',
       payout_amount = refund,
       settled_at = NOW
     WHERE id = bet.id;

2. 라운드 VOIDED 처리:
   UPDATE rounds SET
     status = 'VOIDED',
     void_reason = 'DRAW',
     voided_at = NOW
   WHERE id = ?;
```

**시나리오 C: 정산 실패 (재시도)**
```typescript
// Sui 트랜잭션 실패 시
{
  "success": false,
  "error": {
    "code": "SETTLEMENT_FAILED",
    "message": "정산 중 오류 발생, 재시도 예정",
    "details": {
      "roundId": "uuid",
      "settledCount": 30,   // 30/150 완료
      "failedCount": 120,
      "retryCount": 1
    }
  }
}

// 처리:
// 1. settlement_retry_count 증가
// 2. 미정산 베팅 (settlement_status != 'COMPLETED') 재시도
// 3. 3회 실패 시 → Slack 알림 + 수동 개입
```

**멱등성 보장**:
```typescript
// 이미 정산된 베팅은 건너뛰기
WHERE settlement_status IN ('PENDING', 'FAILED')

// 같은 베팅을 여러 번 정산해도 안전
IF bet.settlement_status == 'COMPLETED':
  SKIP;  // 이미 처리됨
```

**에러 케이스**:
```typescript
// CALCULATING 라운드 없음
{
  "success": false,
  "error": {
    "code": "NO_CALCULATING_ROUND",
    "message": "Round not in CALCULATING status"
  }
}

// Sui 네트워크 오류
{
  "success": false,
  "error": {
    "code": "SUI_NETWORK_ERROR",
    "message": "Sui network is down, retrying later"
  }
}
```

---

### 6. POST /api/cron/recovery

**목적**: 실패한 정산 복구 및 모니터링

**실행 시각**: 매분
```
"* * * * *"
```

**Request Body**: 없음

**Response**:
```typescript
{
  "success": true,
  "data": {
    "recoveredRounds": [
      {
        "roundId": "uuid",
        "status": "SETTLED",
        "recoveredBets": 45,  // 복구된 베팅 수
        "previousStatus": "CALCULATING",
        "stuckDuration": 720  // 멈춰있던 시간 (초)
      }
    ],
    "alertsSent": 2  // Slack 알림 발송 수
  }
}
```

**처리 로직**:
```typescript
1. 장시간 멈춰있는 라운드 찾기:
   SELECT * FROM rounds
   WHERE status = 'CALCULATING'
     AND settlement_started_at < NOW - 10분

2. 각 라운드별 미정산 베팅 찾기:
   SELECT * FROM bets
   WHERE round_id = ?
     AND settlement_status IN ('PENDING', 'FAILED')

3. 재정산 시도 (Job 5와 동일 로직)

4. 3회 실패한 라운드 → Slack 알림:
   IF settlement_retry_count >= 3:
     sendSlackAlert({
       level: 'CRITICAL',
       message: `Round ${roundId} 정산 3회 실패, 수동 개입 필요`,
       details: { roundId, failedBets, lastError }
     });

5. 서버 재시작 후 복구:
   // 서버 시작 시 자동으로 이 Job이 실행되어
   // CALCULATING 상태인 모든 라운드를 복구
```

**알림 트리거**:
```typescript
// Critical 알림
- 정산 3회 실패
- CALCULATING 상태 30분 이상
- 가격 API 연속 10회 실패
- Sui 네트워크 다운 감지

// Warning 알림
- 정산 1회 실패
- Cron Job 5초 이상 지연
- Redis 캐시 미스율 50% 이상
```

**에러 케이스**:
```typescript
// 복구 불가능한 라운드
{
  "success": false,
  "error": {
    "code": "RECOVERY_FAILED",
    "message": "Cannot recover round, manual intervention required",
    "details": {
      "roundId": "uuid",
      "reason": "Sui Settlement Object not found"
    }
  }
}
```

---

### Cron Job 요약

| Job | 목적                 | 실행 시각     | 상태 전이                           |
| --- | -------------------- | ------------- | ----------------------------------- |
| 1   | 라운드 생성          | T-10분        | - → SCHEDULED                       |
| 2   | 라운드 시작          | T+0           | SCHEDULED → BETTING_OPEN            |
| 3   | 베팅 마감            | T+1분         | BETTING_OPEN → BETTING_LOCKED       |
| 4   | 라운드 종료/승자판정 | T+6시간       | BETTING_LOCKED → PRICE_PENDING → CALCULATING |
| 5   | 정산 처리            | 이벤트 기반   | CALCULATING → SETTLED / VOIDED      |
| 6   | 복구 및 모니터링     | 매분          | CALCULATING → SETTLED (재시도)      |

---

## WebSocket Events

### 연결

```typescript
import io from 'socket.io-client';

const socket = io('wss://deltax.app', {
  auth: {
    sessionId: 'session_uuid'
  }
});
```

### 이벤트

**1. round:created**

**발행 주체**: `POST /api/cron/rounds/create` (Cron Job 1)

**발행 시점**: 새 라운드 생성 시 (T-10분)

```typescript
socket.on('round:created', (data) => {
  // {
  //   roundId: 'uuid',
  //   roundNumber: 43,
  //   type: '6HOUR',
  //   status: 'SCHEDULED',
  //   startTime: 1700000000000,
  //   endTime: 1700021600000
  // }
});
```

**용도**: UI에 "곧 시작" 알림 표시

---

**2. round:status_changed**

**발행 주체**: 모든 Cron Job (상태 전이 시)
- Cron Job 2: `SCHEDULED → BETTING_OPEN`
- Cron Job 3: `BETTING_OPEN → BETTING_LOCKED`
- Cron Job 4: `BETTING_LOCKED → CALCULATING`
- Cron Job 5: `CALCULATING → SETTLED/VOIDED`

**발행 시점**: 라운드 상태가 변경될 때마다

```typescript
socket.on('round:status_changed', (data) => {
  // {
  //   roundId: 'uuid',
  //   fromStatus: 'BETTING_OPEN',
  //   toStatus: 'BETTING_LOCKED',
  //   timestamp: 1700000060000,
  //   reason: 'LOCK_TIME_REACHED'  // 선택적
  // }
});
```

**용도**:
- 베팅 버튼 활성화/비활성화
- 카운트다운 타이머 업데이트
- 정산 결과 페이지 이동

---

**3. round:update**

**발행 주체**: `POST /api/bets` (베팅 생성 시)

**발행 시점**: 새 베팅이 생성되어 풀이 업데이트될 때

```typescript
socket.on('round:update', (data) => {
  // {
  //   roundId: 'uuid',
  //   totalPool: 1501000,
  //   totalGoldBets: 801000,
  //   totalBtcBets: 700000,
  //   totalBetsCount: 151,
  //   goldBetsPercentage: '53.33',
  //   btcBetsPercentage: '46.67',
  //   updatedAt: 1700000031000
  // }
});
```

**용도**: 실시간 베팅 풀 현황 업데이트 (차트, 비율)

---

**4. bet:placed**

**발행 주체**: `POST /api/bets` (베팅 생성 시)

**발행 시점**: 베팅이 성공적으로 생성된 직후

```typescript
socket.on('bet:placed', (data) => {
  // {
  //   betId: 'uuid',
  //   roundId: 'uuid',
  //   userId: 'uuid',           // 베팅한 유저
  //   nickname: 'Player123',    // 익명 처리 옵션
  //   prediction: 'GOLD',
  //   amount: 1000,
  //   timestamp: 1700000030000
  // }
});
```

**용도**:
- 베팅 피드 (최근 베팅 목록)
- 애니메이션 효과

---

**5. price:update**

**발행 주체**: `lib/prices/fetcher.ts` (가격 조회 Service, 김현준 담당)

**발행 시점**:
- 주기적 (10초마다)
- Cron Job 2, 4에서 가격 스냅샷 후

```typescript
socket.on('price:update', (data) => {
  // {
  //   gold: "2655.30",
  //   btc: "98450.00",
  //   timestamp: 1700000035000,
  //   source: 'kitco',
  //
  //   // 변동 정보 (선택적)
  //   goldChange: "+0.18%",
  //   btcChange: "-0.05%"
  // }
});
```

**용도**: 실시간 가격 차트 업데이트

---

**6. round:finalized**

**발행 주체**: `POST /api/cron/rounds/finalize` (Cron Job 4)

**발행 시점**: 라운드 종료 및 승자 판정 완료 시

```typescript
socket.on('round:finalized', (data) => {
  // {
  //   roundId: 'uuid',
  //   winner: 'BTC',
  //   goldStartPrice: "2650.50",
  //   goldEndPrice: "2680.20",
  //   btcStartPrice: "98234.00",
  //   btcEndPrice: "99500.00",
  //   goldChangePercent: "1.12",
  //   btcChangePercent: "1.29",
  //   timestamp: 1700021601000
  // }
});
```

**용도**: 승자 발표 UI, 결과 페이지 이동

---

**7. settlement:completed**

**발행 주체**: `POST /api/cron/rounds/settle` (Cron Job 5)

**발행 시점**: 모든 배당 지급 완료 시

```typescript
socket.on('settlement:completed', (data) => {
  // {
  //   roundId: 'uuid',
  //   winner: 'GOLD',
  //   payoutRatio: '1.78',
  //   totalWinners: 85,
  //   totalLosers: 65,
  //   platformFee: 75000,
  //   payoutPool: 1425000,
  //   settledAt: 1700021630000
  // }
});
```

**용도**:
- 배당금 수령 알림
- 정산 완료 표시
- 유저 잔액 업데이트

---

**8. bet:settled** (개별 베팅 정산 완료)

**발행 주체**: `POST /api/cron/rounds/settle` (Cron Job 5, 각 베팅마다)

**발행 시점**: 개별 베팅이 정산될 때마다

```typescript
socket.on('bet:settled', (data) => {
  // {
  //   betId: 'uuid',
  //   userId: 'uuid',          // 베팅한 유저
  //   roundId: 'uuid',
  //   result: 'WON',           // WON | LOST | REFUNDED
  //   payoutAmount: 1780,      // 지급된 금액
  //   timestamp: 1700021625000
  // }
});
```

**용도**:
- 개별 유저에게 정산 결과 알림
- 승리/패배 애니메이션
- 유저별 필터링 (userId로)

---

## 에러 코드

### 공통 에러

| 코드                | HTTP Status | 설명                   |
| ------------------- | ----------- | ---------------------- |
| `UNAUTHORIZED`      | 401         | 인증 필요              |
| `FORBIDDEN`         | 403         | 권한 없음              |
| `NOT_FOUND`         | 404         | 리소스 없음            |
| `VALIDATION_ERROR`  | 400         | 요청 데이터 검증 실패  |
| `INTERNAL_ERROR`    | 500         | 서버 내부 오류         |

### 베팅 관련 에러

| 코드                    | HTTP Status | 설명                     |
| ----------------------- | ----------- | ------------------------ |
| `BETTING_CLOSED`        | 400         | 베팅 마감됨              |
| `ROUND_NOT_FOUND`       | 404         | 라운드 없음              |
| `INSUFFICIENT_BALANCE`  | 400         | 잔액 부족                |
| `INVALID_AMOUNT`        | 400         | 유효하지 않은 베팅 금액  |
| `DUPLICATE_BET`         | 400         | 중복 베팅 (같은 라운드)  |
| `SUI_TX_FAILED`         | 500         | Sui 트랜잭션 실패        |

### 라운드 관련 에러

| 코드                    | HTTP Status | 설명                   |
| ----------------------- | ----------- | ---------------------- |
| `NO_ACTIVE_ROUND`       | 404         | 활성 라운드 없음       |
| `INVALID_TRANSITION`    | 400         | 잘못된 상태 전이       |
| `PRICE_FETCH_FAILED`    | 500         | 가격 조회 실패         |

### 유저 관련 에러

| 코드                  | HTTP Status | 설명                |
| --------------------- | ----------- | ------------------- |
| `USER_NOT_FOUND`      | 404         | 유저 없음           |
| `NICKNAME_TAKEN`      | 400         | 닉네임 중복         |
| `ALREADY_ATTENDED`    | 400         | 이미 출석함         |

### Cron Job 관련 에러

| 코드                         | HTTP Status | 설명                                   |
| ---------------------------- | ----------- | -------------------------------------- |
| `NO_SCHEDULED_ROUND`         | 404         | SCHEDULED 라운드 없음 (Job 2)          |
| `NO_OPEN_ROUND`              | 404         | BETTING_OPEN 라운드 없음 (Job 3)       |
| `NO_LOCKED_ROUND`            | 404         | BETTING_LOCKED 라운드 없음 (Job 4)     |
| `NO_CALCULATING_ROUND`       | 404         | CALCULATING 라운드 없음 (Job 5)        |
| `DUPLICATE_ROUND`            | 400         | 중복 라운드 (같은 시각)                |
| `PRICE_FETCH_FAILED`         | 500         | 가격 조회 실패 (Start/End Price)       |
| `END_PRICE_FETCH_FAILED`     | 500         | End Price 조회 실패                    |
| `SUI_POOL_CREATION_FAILED`   | 500         | Sui BettingPool 생성 실패              |
| `SUI_NETWORK_ERROR`          | 500         | Sui 네트워크 오류                      |
| `SETTLEMENT_FAILED`          | 500         | 정산 실패 (재시도 예정)                |
| `RECOVERY_FAILED`            | 500         | 복구 실패 (수동 개입 필요)             |

---

## 요약

### API 엔드포인트 개수
- **Rounds**: 4개 (조회 3, 생성 1)
- **Bets**: 3개 (생성 1, 조회 2)
- **Users**: 4개 (조회 2, 수정 1, 랭킹 1)
- **Settlements**: 1개 (조회)
- **Points**: 2개 (출석 1, 거래 이력 1)
- **Admin**: 2개 (정산, 취소)
- **Cron Job**: 6개 (생성, 시작, 마감, 종료, 정산, 복구)
- **총**: 22개 REST API + WebSocket 8개 이벤트

### Rate Limiting (향후 적용)

```
일반 유저:
- 베팅: 10 req/min
- 조회: 100 req/min

Admin:
- 무제한
```

### Caching 전략

**Redis 캐싱 대상**
- `/api/rounds/current`: TTL 5초
- `/api/users/ranking`: TTL 1분
- 가격 데이터: TTL 10초

---
