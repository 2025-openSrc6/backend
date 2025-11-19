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
10. [WebSocket Events](#websocket-events)
11. [에러 코드](#에러-코드)

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

| 카테고리  | 책임자 | 설명               |
| --------- | ------ | ------------------ |
| `/rounds` | 태웅   | 라운드 조회, 생성  |
| `/bets`   | 태웅   | 베팅 생성, 조회    |
| `/users`  | 도영   | 유저 정보, 랭킹    |
| `/points` | 도영   | 재화 관리, 출석    |
| `/nfts`   | 영민   | NFT 조회, 구매     |
| `/shop`   | 영민   | 상점 아이템        |
| `/prices` | 현준   | 실시간 가격 데이터 |
| `/admin`  | 태웅   | 관리자 전용        |

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
  type: '1MIN' | '6HOUR' | '1DAY'; // 필수
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
  id: string; // 라운드 UUID
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

## WebSocket Events

### 연결

```typescript
import io from 'socket.io-client';

const socket = io('wss://deltax.app', {
  auth: {
    sessionId: 'session_uuid',
  },
});
```

### 이벤트

**1. round:update**

```typescript
// 서버 → 클라이언트
socket.on('round:update', (data) => {
  console.log(data);
  // {
  //   roundId: 'uuid',
  //   totalPool: 1501000,
  //   totalGoldBets: 801000,
  //   totalBtcBets: 700000,
  //   totalBetsCount: 151,
  //   updatedAt: 1700000031000
  // }
});
```

**2. round:status_changed**

```typescript
socket.on('round:status_changed', (data) => {
  // {
  //   roundId: 'uuid',
  //   fromStatus: 'BETTING_OPEN',
  //   toStatus: 'BETTING_LOCKED',
  //   timestamp: 1700000060000
  // }
});
```

**3. bet:placed**

```typescript
socket.on('bet:placed', (data) => {
  // {
  //   roundId: 'uuid',
  //   prediction: 'GOLD',
  //   amount: 1000,
  //   totalPool: 1501000
  // }
});
```

**4. price:update** (김현준 담당)

```typescript
socket.on('price:update', (data) => {
  // {
  //   gold: "2655.30",
  //   btc: "98450.00",
  //   timestamp: 1700000035000,
  //   source: 'kitco'
  // }
});
```

**5. settlement:completed**

```typescript
socket.on('settlement:completed', (data) => {
  // {
  //   roundId: 'uuid',
  //   winner: 'GOLD',
  //   payoutRatio: '1.78',
  //   totalWinners: 85,
  //   settledAt: 1700021630000
  // }
});
```

---

## 에러 코드

### 공통 에러

| 코드               | HTTP Status | 설명                  |
| ------------------ | ----------- | --------------------- |
| `UNAUTHORIZED`     | 401         | 인증 필요             |
| `FORBIDDEN`        | 403         | 권한 없음             |
| `NOT_FOUND`        | 404         | 리소스 없음           |
| `VALIDATION_ERROR` | 400         | 요청 데이터 검증 실패 |
| `INTERNAL_ERROR`   | 500         | 서버 내부 오류        |

### 베팅 관련 에러

| 코드                   | HTTP Status | 설명                    |
| ---------------------- | ----------- | ----------------------- |
| `BETTING_CLOSED`       | 400         | 베팅 마감됨             |
| `ROUND_NOT_FOUND`      | 404         | 라운드 없음             |
| `INSUFFICIENT_BALANCE` | 400         | 잔액 부족               |
| `INVALID_AMOUNT`       | 400         | 유효하지 않은 베팅 금액 |
| `DUPLICATE_BET`        | 400         | 중복 베팅 (같은 라운드) |
| `SUI_TX_FAILED`        | 500         | Sui 트랜잭션 실패       |

### 라운드 관련 에러

| 코드                 | HTTP Status | 설명             |
| -------------------- | ----------- | ---------------- |
| `NO_ACTIVE_ROUND`    | 404         | 활성 라운드 없음 |
| `INVALID_TRANSITION` | 400         | 잘못된 상태 전이 |
| `PRICE_FETCH_FAILED` | 500         | 가격 조회 실패   |

### 유저 관련 에러

| 코드               | HTTP Status | 설명        |
| ------------------ | ----------- | ----------- |
| `USER_NOT_FOUND`   | 404         | 유저 없음   |
| `NICKNAME_TAKEN`   | 400         | 닉네임 중복 |
| `ALREADY_ATTENDED` | 400         | 이미 출석함 |

---

## 요약

### API 엔드포인트 개수

- **Rounds**: 4개 (조회 3, 생성 1)
- **Bets**: 3개 (생성 1, 조회 2)
- **Users**: 4개 (조회 2, 수정 1, 랭킹 1)
- **Settlements**: 1개 (조회)
- **Points**: 2개 (출석 1, 거래 이력 1)
- **Admin**: 2개 (정산, 취소)
- **총**: 16개 REST API + WebSocket 5개 이벤트

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
