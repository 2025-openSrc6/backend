# 에러 처리 가이드

## 기본 원칙

1. **Service Layer에서만 에러를 발생**시킵니다
   - Controller(Route Handler)는 에러를 발생시키지 않음
   - `handleApiError()`가 자동으로 HTTP 응답으로 변환

2. **적절한 에러 클래스를 선택**합니다
   - 에러 상황에 맞는 클래스 사용
   - HTTP 상태 코드는 자동으로 결정됨

3. **명확한 메시지를 제공**합니다
   - 한국어 사용자 메시지
   - 디버깅을 위한 details 추가 (선택적)

---

## 에러 클래스별 사용 규칙

### 1. ValidationError (400 Bad Request)

**언제 사용하나요?**

- 입력값 형식이 잘못되었을 때
- Zod 검증 외에 추가 검증이 실패했을 때
- 타입은 맞지만 값의 범위나 형식이 잘못되었을 때

**생성자**

```typescript
new ValidationError(message: string, details?: unknown)
```

**사용 예시**

```typescript
// UUID 형식 검증 실패
if (!this.isValidUuid(id)) {
  throw new ValidationError('Invalid UUID format', { id });
}

// 페이지 번호 검증
if (page < 1) {
  throw new ValidationError('Page must be at least 1', { page });
}

// 날짜 범위 검증
if (endDate < startDate) {
  throw new ValidationError('End date must be after start date', {
    startDate,
    endDate,
  });
}
```

**주의사항**

- Zod 검증은 자동으로 ZodError → VALIDATION_ERROR로 변환됨
- 수동 검증이 필요한 경우에만 직접 throw

---

### 2. NotFoundError (404 Not Found)

**언제 사용하나요?**

- DB 조회 결과가 없을 때
- 특정 ID의 리소스가 존재하지 않을 때
- 현재 활성 상태인 리소스가 없을 때

**생성자**

```typescript
new NotFoundError(resource: string, id: string)
```

**사용 예시**

```typescript
// 특정 ID로 조회 실패
const round = await this.repository.findById(id);
if (!round) {
  throw new NotFoundError('Round', id);
}

// 현재 활성 라운드 없음
const round = await this.repository.findCurrentRound(type);
if (!round) {
  throw new NotFoundError('Current active round', type);
}

// 사용자 조회 실패
const user = await this.repository.findByEmail(email);
if (!user) {
  throw new NotFoundError('User', email);
}
```

**주의사항**

- `resource`는 영어로 작성 (메시지 템플릿: `{resource} not found: {id}`)
- `id`는 조회에 사용한 키 값 (UUID, email, type 등)

---

### 3. BusinessRuleError (400 Bad Request)

**언제 사용하나요?**

- 비즈니스 로직 규칙을 위반했을 때
- 입력은 유효하지만 현재 상태에서 수행할 수 없는 작업
- 도메인 제약 조건 위반

**생성자**

```typescript
new BusinessRuleError(code: string, message: string, details?: unknown)
```

**사용 예시**

```typescript
// 베팅 마감된 라운드에 베팅 시도
if (round.status === 'BETTING_LOCKED') {
  throw new BusinessRuleError('BETTING_CLOSED', '베팅이 마감되었습니다', {
    roundId: round.id,
    status: round.status,
  });
}

// 잔액 부족
if (user.balance < amount) {
  throw new BusinessRuleError('INSUFFICIENT_BALANCE', '잔액이 부족합니다', {
    required: amount,
    current: user.balance,
  });
}

// 중복 베팅 시도
if (existingBet) {
  throw new BusinessRuleError('DUPLICATE_BET', '이미 해당 라운드에 베팅하셨습니다', {
    roundId,
    userId,
    existingBetId: existingBet.id,
  });
}
```

**주의사항**

- `code`는 UPPER_SNAKE_CASE로 작성
- 비즈니스 도메인 용어 사용
- ValidationError와 구분: 형식 문제 → Validation, 규칙 위반 → BusinessRule

---

### 4. UnauthorizedError (401 Unauthorized)

**언제 사용하나요?**

- 인증이 필요한 엔드포인트에 비인증 요청
- 토큰이 없거나 만료되었을 때
- 로그인이 필요한 작업

**생성자**

```typescript
new UnauthorizedError(message?: string, details?: unknown)
```

**사용 예시**

```typescript
// 토큰 없음
if (!token) {
  throw new UnauthorizedError('로그인이 필요합니다');
}

// 토큰 만료
if (isTokenExpired(token)) {
  throw new UnauthorizedError('토큰이 만료되었습니다. 다시 로그인해주세요');
}

// 세션 없음
if (!session) {
  throw new UnauthorizedError(); // 기본 메시지: "인증이 필요합니다"
}
```

---

### 5. ForbiddenError (403 Forbidden)

**언제 사용하나요?**

- 인증은 되었지만 권한이 없을 때
- 본인의 리소스가 아닌 것을 수정/삭제 시도
- 역할(role)에 따른 접근 제한

**생성자**

```typescript
new ForbiddenError(message?: string, details?: unknown)
```

**사용 예시**

```typescript
// 다른 사용자의 베팅 취소 시도
if (bet.userId !== currentUserId) {
  throw new ForbiddenError('본인의 베팅만 취소할 수 있습니다', {
    betUserId: bet.userId,
    currentUserId,
  });
}

// 관리자 전용 기능
if (user.role !== 'ADMIN') {
  throw new ForbiddenError('관리자만 접근할 수 있습니다', { role: user.role });
}

// 소유권 확인
if (round.createdBy !== userId) {
  throw new ForbiddenError(); // 기본 메시지: "권한이 없습니다"
}
```

---

## ValidationError vs BusinessRuleError 구분

많이 헷갈리는 두 에러의 차이:

| 구분        | ValidationError             | BusinessRuleError     |
| ----------- | --------------------------- | --------------------- |
| **목적**    | 입력 형식 검증              | 비즈니스 규칙 검증    |
| **시점**    | 요청 파싱 직후              | 비즈니스 로직 수행 중 |
| **예시**    | UUID 형식 오류, 음수 페이지 | 베팅 마감, 잔액 부족  |
| **DB 조회** | 필요 없음                   | 필요할 수 있음        |
| **메시지**  | 입력값 문제                 | 상태/규칙 문제        |

**예시로 보는 차이**

```typescript
// ❌ ValidationError - 형식 문제
if (amount < 0) {
  throw new ValidationError('Amount must be positive', { amount });
}

// ✅ BusinessRuleError - 규칙 위반
if (amount < MIN_BET_AMOUNT) {
  throw new BusinessRuleError('MINIMUM_BET_NOT_MET', `최소 베팅 금액은 ${MIN_BET_AMOUNT}입니다`, {
    amount,
    minimum: MIN_BET_AMOUNT,
  });
}
```

---

## 에러 처리 플로우

```
사용자 요청
    ↓
Controller (Route Handler)
    ↓ try
Service Layer (검증 + 로직)
    ↓
    ├─ Zod 검증 실패 → ZodError (자동 변환)
    ├─ 수동 검증 실패 → ValidationError
    ├─ 리소스 없음 → NotFoundError
    ├─ 규칙 위반 → BusinessRuleError
    ├─ 인증 실패 → UnauthorizedError
    └─ 권한 없음 → ForbiddenError
    ↓ catch (error)
handleApiError(error)
    ↓
적절한 HTTP 응답 반환
```

---

## 실전 예시: 베팅 생성 API

```typescript
// app/api/bets/route.ts (Controller)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const session = await getSession(request);

    const result = await registry.betService.createBet(body, session?.userId);
    return createSuccessResponse(result, 201);
  } catch (error) {
    return handleApiError(error);  // 모든 에러 자동 변환
  }
}

// lib/bets/service.ts (Service)
async createBet(rawData: unknown, userId?: string) {
  // 1. 인증 확인
  if (!userId) {
    throw new UnauthorizedError('로그인이 필요합니다');
  }

  // 2. 입력 검증 (Zod)
  const validated = createBetSchema.parse(rawData);  // ZodError 자동 변환

  // 3. 추가 검증
  if (validated.amount < 0) {
    throw new ValidationError('Betting amount must be positive', {
      amount: validated.amount
    });
  }

  // 4. 라운드 조회
  const round = await this.roundRepository.findById(validated.roundId);
  if (!round) {
    throw new NotFoundError('Round', validated.roundId);
  }

  // 5. 비즈니스 규칙 확인
  if (round.status !== 'BETTING_OPEN') {
    throw new BusinessRuleError(
      'BETTING_CLOSED',
      '베팅이 마감되었습니다',
      { roundStatus: round.status }
    );
  }

  if (validated.amount < MIN_BET_AMOUNT) {
    throw new BusinessRuleError(
      'MINIMUM_BET_NOT_MET',
      `최소 베팅 금액은 ${MIN_BET_AMOUNT}입니다`,
      { amount: validated.amount, minimum: MIN_BET_AMOUNT }
    );
  }

  // 6. 중복 체크
  const existingBet = await this.betRepository.findByUserAndRound(
    userId,
    validated.roundId
  );
  if (existingBet) {
    throw new BusinessRuleError(
      'DUPLICATE_BET',
      '이미 해당 라운드에 베팅하셨습니다',
      { existingBetId: existingBet.id }
    );
  }

  // 7. 잔액 확인
  const user = await this.userRepository.findById(userId);
  if (user.balance < validated.amount) {
    throw new BusinessRuleError(
      'INSUFFICIENT_BALANCE',
      '잔액이 부족합니다',
      { required: validated.amount, current: user.balance }
    );
  }

  // 8. 베팅 생성
  return this.betRepository.create({
    userId,
    roundId: validated.roundId,
    amount: validated.amount,
    prediction: validated.prediction,
  });
}
```

---

## 체크리스트

Service Layer 코드 작성 시 확인:

- [ ] Controller에서는 에러를 throw하지 않았나?
- [ ] 모든 에러가 `handleApiError()`로 처리되나?
- [ ] ValidationError와 BusinessRuleError를 올바르게 구분했나?
- [ ] NotFoundError의 resource, id를 명확하게 작성했나?
- [ ] BusinessRuleError의 code가 UPPER_SNAKE_CASE인가?
- [ ] 에러 메시지가 한국어로 사용자 친화적인가?
- [ ] 필요한 경우 details를 제공했나?

---

## 참고

- `lib/shared/errors.ts` - 에러 클래스 정의
- `lib/shared/response.ts` - `handleApiError()` 구현
- `app/api/rounds/current/route.ts` - Controller 예시
- `lib/rounds/service.ts` - Service 예시
