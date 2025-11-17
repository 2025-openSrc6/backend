# API 인증 & 권한 관리 가이드

> **중요**: Next.js API Routes는 기본적으로 완전히 공개됩니다.
> Admin 전용 API는 **반드시 인증/권한 검증이 필요**합니다.

---

## 📋 목차

1. [Next.js API Routes 보안 기본](#1-nextjs-api-routes-보안-기본)
2. [인증 방식 비교](#2-인증-방식-비교)
3. [Session 기반 인증 구현 (추천)](#3-session-기반-인증-구현-추천)
4. [Admin 권한 체크](#4-admin-권한-체크)
5. [API Key 인증 (Cron Job용)](#5-api-key-인증-cron-job용)
6. [실전 적용](#6-실전-적용)

---

## 1. Next.js API Routes 보안 기본

### 현실: API는 완전히 공개됨

```bash
# 누구나 접근 가능
curl https://deltax.app/api/rounds
curl -X POST https://deltax.app/api/rounds -d '{"type":"6HOUR","startTime":1700000000}'

# Next.js 빌드로는 막을 수 없음!
```

### 보호 방법

1. **인증 (Authentication)**: 너 누구야?
   - Session/Cookie
   - JWT Token
   - API Key

2. **권한 (Authorization)**: 너 이거 할 수 있어?
   - Role 체크 (USER, ADMIN)
   - Resource 소유권 체크

---

## 2. 인증 방식 비교

| 방식                 | 장점                   | 단점                    | 사용 케이스        |
| -------------------- | ---------------------- | ----------------------- | ------------------ |
| **Session + Cookie** | 간단, 안전 (httpOnly)  | 서버 상태 관리 필요     | 일반 유저 API      |
| **JWT Token**        | Stateless, 확장성 좋음 | 토큰 크기 큼, 갱신 복잡 | SPA, Mobile App    |
| **API Key**          | 매우 간단              | 유출 위험               | Cron Job, Internal |

### 추천: Hybrid

```
일반 유저 (프론트엔드)  →  Session/Cookie
Cron Job (백엔드)       →  API Key
```

---

## 3. Session 기반 인증 구현 (추천)

### 3.1. Session 생성 (Sui 지갑 로그인)

```typescript
// app/api/auth/login/route.ts

import { NextRequest } from 'next/server';
import { verifySignature } from '@/lib/auth/sui-verify';
import { createSession } from '@/lib/auth/session';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

/**
 * POST /api/auth/login
 *
 * Sui 지갑으로 로그인
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { suiAddress, signature, message } = body;

    // 1. 서명 검증 (Sui 지갑 소유권 증명)
    const isValid = await verifySignature(suiAddress, signature, message);
    if (!isValid) {
      return createErrorResponse(401, 'INVALID_SIGNATURE', 'Invalid wallet signature');
    }

    // 2. 유저 조회 또는 생성
    let user = await userRepository.findBySuiAddress(suiAddress);
    if (!user) {
      user = await userRepository.create({ suiAddress });
    }

    // 3. 세션 생성
    const session = await createSession({
      userId: user.id,
      suiAddress: user.suiAddress,
      role: user.role, // 'USER' or 'ADMIN'
    });

    // 4. 쿠키 설정 (httpOnly로 XSS 방지)
    const response = createSuccessResponse({
      user: {
        id: user.id,
        suiAddress: user.suiAddress,
        role: user.role,
      },
      sessionId: session.id,
    });

    response.cookies.set('session', session.id, {
      httpOnly: true, // JS에서 접근 불가 (XSS 방지)
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7일
      path: '/',
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 3.2. Session 검증 미들웨어

```typescript
// lib/auth/middleware.ts

import { NextRequest } from 'next/server';
import { getSession } from './session';
import { UnauthorizedError, ForbiddenError } from '@/lib/shared/errors';

/**
 * 세션 정보 타입
 */
export interface SessionData {
  userId: string;
  suiAddress: string;
  role: 'USER' | 'ADMIN';
}

/**
 * 현재 로그인한 유저 세션 가져오기
 *
 * @throws {UnauthorizedError} 로그인하지 않은 경우
 */
export async function requireAuth(request: NextRequest): Promise<SessionData> {
  const sessionId = request.cookies.get('session')?.value;

  if (!sessionId) {
    throw new UnauthorizedError('Login required');
  }

  const session = await getSession(sessionId);

  if (!session) {
    throw new UnauthorizedError('Invalid or expired session');
  }

  return session;
}

/**
 * Admin 권한 체크
 *
 * @throws {UnauthorizedError} 로그인하지 않은 경우
 * @throws {ForbiddenError} Admin 권한이 없는 경우
 */
export async function requireAdmin(request: NextRequest): Promise<SessionData> {
  const session = await requireAuth(request);

  if (session.role !== 'ADMIN') {
    throw new ForbiddenError('Admin role required');
  }

  return session;
}

/**
 * 선택적 인증 (로그인 안 해도 OK, 했으면 정보 반환)
 */
export async function optionalAuth(request: NextRequest): Promise<SessionData | null> {
  const sessionId = request.cookies.get('session')?.value;

  if (!sessionId) {
    return null;
  }

  const session = await getSession(sessionId);
  return session;
}
```

### 3.3. Session 저장소 (Redis 또는 D1)

```typescript
// lib/auth/session.ts

import { redis } from '@/lib/redis'; // 또는 D1

interface CreateSessionInput {
  userId: string;
  suiAddress: string;
  role: 'USER' | 'ADMIN';
}

/**
 * 세션 생성
 */
export async function createSession(data: CreateSessionInput): Promise<{ id: string }> {
  const sessionId = crypto.randomUUID();

  // Redis에 저장 (7일 TTL)
  await redis.setex(
    `session:${sessionId}`,
    60 * 60 * 24 * 7, // 7일
    JSON.stringify(data),
  );

  return { id: sessionId };
}

/**
 * 세션 조회
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  const data = await redis.get(`session:${sessionId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data);
}

/**
 * 세션 삭제 (로그아웃)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(`session:${sessionId}`);
}
```

---

## 4. Admin 권한 체크

### 4.1. Admin 전용 API 보호

```typescript
// app/api/rounds/route.ts (POST)

import { requireAdmin } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  try {
    // 1. Admin 권한 체크 (필수!)
    const session = await requireAdmin(request);

    // 이 시점에 도달했다면:
    // - 로그인되어 있음
    // - session.role === 'ADMIN'
    // - 그렇지 않으면 위에서 이미 에러 발생함

    // 2. Request Body 파싱
    const body = await request.json();

    // 3. Service 호출
    const round = await registry.roundService.createRound(body);

    return createSuccessResponse({ round });
  } catch (error) {
    // UnauthorizedError, ForbiddenError 등 자동 처리됨
    return handleApiError(error);
  }
}
```

### 4.2. 선택적 인증 (로그인 여부에 따라 다른 데이터)

```typescript
// app/api/rounds/[id]/route.ts

import { optionalAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // 1. 선택적 인증 (로그인 안 해도 OK)
    const session = await optionalAuth(request);

    // 2. 라운드 조회
    const round = await registry.roundService.getRoundById(params.id);

    // 3. Admin이면 더 많은 정보 반환
    if (session?.role === 'ADMIN') {
      return createSuccessResponse({
        round,
        adminData: {
          // Admin만 볼 수 있는 정보
          internalNotes: round.internalNotes,
          priceSource: round.startPriceSource,
        },
      });
    }

    // 4. 일반 유저는 공개 정보만
    return createSuccessResponse({ round });
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

## 5. API Key 인증 (Cron Job용)

Cron Job이나 내부 서비스는 Cookie를 사용할 수 없으므로 API Key 사용.

### 5.1. API Key 설정

```bash
# .env.local
CRON_API_KEY=your-secret-key-here-use-long-random-string
```

### 5.2. API Key 검증 미들웨어

```typescript
// lib/auth/api-key.ts

import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@/lib/shared/errors';

/**
 * API Key 검증 (Cron Job, 내부 서비스용)
 *
 * @throws {UnauthorizedError} API Key가 없거나 틀린 경우
 */
export function requireApiKey(request: NextRequest): void {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    throw new UnauthorizedError('API Key required');
  }

  const validKey = process.env.CRON_API_KEY;

  if (apiKey !== validKey) {
    throw new UnauthorizedError('Invalid API Key');
  }
}
```

### 5.3. Cron Job용 엔드포인트

```typescript
// app/api/cron/create-round/route.ts

import { requireApiKey } from '@/lib/auth/api-key';

/**
 * POST /api/cron/create-round
 *
 * Cron Job에서 호출 (API Key 필요)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. API Key 검증
    requireApiKey(request);

    // 2. 다음 라운드 시간 계산
    const nextSchedule = calculateNextRoundSchedule('6HOUR');

    // 3. 라운드 생성
    const round = await registry.roundService.createRound({
      type: '6HOUR',
      startTime: Math.floor(nextSchedule.startTime / 1000),
    });

    return createSuccessResponse({ round });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 5.4. Cron Job 설정 (Cloudflare Workers)

```toml
# wrangler.toml

[triggers]
crons = [
  # 매일 4회 (라운드 10분 전)
  "50 16,22,4,10 * * *"
]

[env.production.vars]
CRON_API_KEY = "your-secret-key-here"
```

```typescript
// worker/scheduled.ts

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // Cron Job 실행 시 자동 호출
    await fetch('https://deltax.app/api/cron/create-round', {
      method: 'POST',
      headers: {
        'x-api-key': env.CRON_API_KEY,
      },
    });
  },
};
```

---

## 6. 실전 적용

### 6.1. API 권한 매트릭스

| API Endpoint              | 인증 필요 | 권한    | 미들웨어        |
| ------------------------- | --------- | ------- | --------------- |
| `GET /api/rounds`         | ❌        | 공개    | -               |
| `GET /api/rounds/:id`     | ❌        | 공개    | -               |
| `GET /api/rounds/current` | ❌        | 공개    | -               |
| `POST /api/rounds`        | ✅        | Admin   | `requireAdmin`  |
| `POST /api/bets`          | ✅        | User    | `requireAuth`   |
| `GET /api/users/me`       | ✅        | User    | `requireAuth`   |
| `POST /api/admin/*`       | ✅        | Admin   | `requireAdmin`  |
| `POST /api/cron/*`        | ✅        | API Key | `requireApiKey` |

### 6.2. 적용 예시: POST /api/rounds

```typescript
// app/api/rounds/route.ts

import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { requireAdmin } from '@/lib/auth/middleware';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

export async function POST(request: NextRequest) {
  try {
    // ✅ Admin 권한 체크 (필수!)
    await requireAdmin(request);

    const body = await request.json();
    const round = await registry.roundService.createRound(body);

    return createSuccessResponse({ round });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 6.3. 적용 예시: POST /api/bets

```typescript
// app/api/bets/route.ts

import { requireAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  try {
    // ✅ 로그인 체크 (필수!)
    const session = await requireAuth(request);

    const body = await request.json();

    // 베팅 생성 시 userId는 세션에서 가져옴 (조작 방지)
    const bet = await registry.betService.createBet({
      ...body,
      userId: session.userId, // 클라이언트에서 받은 값 무시!
    });

    return createSuccessResponse({ bet });
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

## 7. 보안 체크리스트

### ✅ 필수

- [ ] Admin 전용 API는 `requireAdmin()` 사용
- [ ] 유저 정보는 세션에서 가져오기 (클라이언트 입력 신뢰 금지)
- [ ] Session Cookie는 `httpOnly: true` 설정
- [ ] API Key는 환경 변수에 저장 (코드에 하드코딩 금지)
- [ ] HTTPS 사용 (프로덕션)
- [ ] CORS 설정 (허용된 도메인만)

### 🔒 추가 보안

- [ ] Rate Limiting (DoS 방지)
- [ ] CSRF Token (POST 요청)
- [ ] Input Validation (Zod)
- [ ] SQL Injection 방지 (Drizzle ORM 사용)
- [ ] 에러 메시지에 민감 정보 포함 금지

---

## 8. FAQ

### Q1: Session 없이 JWT만 써도 되나요?

**A**: 가능하지만 복잡합니다.

- JWT는 Stateless이므로 로그아웃 구현이 어려움
- Refresh Token 관리 필요
- 토큰 크기가 커서 매 요청마다 오버헤드

**추천**: Session + Cookie (간단, 안전)

### Q2: Admin은 어떻게 관리하나요?

**A**: DB에 `users.role` 컬럼 추가

```sql
UPDATE users SET role = 'ADMIN' WHERE sui_address = '0x...';
```

초기 Admin은 수동 설정, 이후 Admin Panel에서 관리.

### Q3: API Key 유출되면?

**A**:

1. 즉시 `.env` 변경
2. 재배포
3. 로그에서 의심 활동 확인

**예방**:

- API Key는 백엔드에서만 사용 (프론트엔드 ❌)
- Cloudflare Workers Secrets 사용

### Q4: Cron Job이 실패하면?

**A**:

- Cloudflare Workers는 자동 재시도 (3회)
- 실패 시 로그 기록 + Slack 알림
- 수동 복구: POST /api/rounds 직접 호출

---

## 요약

1. **Next.js API는 기본적으로 공개**
   - 빌드로는 보호 안 됨
   - 반드시 인증 코드 필요

2. **인증 방식**
   - 일반 유저: Session + Cookie
   - Cron Job: API Key

3. **권한 체크**
   - Admin 전용: `requireAdmin()`
   - 유저 전용: `requireAuth()`
   - 공개: 인증 불필요

4. **보안 원칙**
   - 클라이언트 입력 신뢰 금지
   - 세션에서 userId 가져오기
   - API Key는 환경 변수
   - httpOnly Cookie 사용
