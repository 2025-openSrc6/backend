# Quick Start - 리팩토링 적용 가이드

5분 안에 리팩토링된 구조 적용하기

---

## 📦 생성된 파일 목록

```
✅ docs/ehdnd/
   ├── ARCHITECTURE_GUIDE.md       # 아키텍처 가이드 (상세)
   └── REFACTORING_GUIDE.md        # 리팩토링 가이드 (Before/After)

✅ lib/
   └── registry.ts                  # ⭐ 의존성 조립 파일

✅ lib/shared/                      # 공통 유틸리티 (모든 API에서 재사용)
   ├── errors.ts                    # 에러 클래스들
   └── response.ts                  # 응답 헬퍼 함수들

✅ lib/rounds/                      # Rounds 도메인
   ├── types.ts                     # 타입 정의
   ├── constants.ts                 # 상수
   ├── validation.ts                # Zod schemas
   ├── repository.ts                # DB 접근 레이어
   └── service.ts                   # 비즈니스 로직 레이어

✅ app/api/rounds/
   ├── route.ts                     # ✨ 실제 적용된 버전 (registry 사용)
   ├── route.commented.ts           # 원본 + 상세 주석 (학습용)
   └── route.refactored.ts          # 리팩토링 버전 (백업)
```

---

## 🚀 Step-by-Step 적용 가이드

### Step 1: 의존성 설치 (30초)

```bash
npm install zod
```

### Step 2: 확인 (10초)

✅ `app/api/rounds/route.ts`가 이미 업데이트되었습니다!
- 의존성 조립 파일 사용
- `registry.roundService.getRounds()` 호출

```bash
# 확인
cat app/api/rounds/route.ts | grep "registry"
```

### Step 4: 빌드 확인 (1분)

```bash
npm run build
```

### Step 5: 테스트 (2분)

```bash
# 개발 서버 실행
npm run dev

# 다른 터미널에서 테스트
curl "http://localhost:3000/api/rounds?page=1&pageSize=10"
curl "http://localhost:3000/api/rounds?type=6HOUR&status=BETTING_OPEN"
```

**예상 결과**:
```json
{
  "success": true,
  "data": {
    "rounds": [...]
  },
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

## ✅ 체크리스트

### 코드 확인

- [ ] `lib/shared/errors.ts` 존재 확인
- [ ] `lib/shared/response.ts` 존재 확인
- [ ] `lib/rounds/service.ts` 존재 확인
- [ ] `lib/rounds/repository.ts` 존재 확인
- [ ] `app/api/rounds/route.ts` 업데이트됨

### 빌드 확인

- [ ] `npm run build` 성공
- [ ] TypeScript 에러 없음
- [ ] Lint 에러 없음 (있다면 무시 가능)

### 기능 확인

- [ ] GET /api/rounds 동작
- [ ] 페이지네이션 동작 (?page=2)
- [ ] 필터링 동작 (?type=6HOUR)
- [ ] 정렬 동작 (?sort=round_number&order=asc)
- [ ] 에러 케이스 동작 (?page=-1 → 400 에러)

---

## 🎯 다음 작업 우선순위

### 우선순위 1: 나머지 Rounds API (오늘)

**GET /api/rounds/current** 구현:

1. `lib/rounds/service.ts`에 메서드 추가:
```typescript
async getCurrentRound(type: RoundType): Promise<Round | null> {
  const rounds = await this.repository.findMany({
    filters: {
      type,
      statuses: ['BETTING_OPEN', 'BETTING_LOCKED'],
    },
    sort: 'start_time',
    order: 'desc',
    limit: 1,
    offset: 0,
  });

  return rounds[0] ?? null;
}
```

2. `app/api/rounds/current/route.ts` 생성:
```typescript
import { NextRequest } from 'next/server';
import { RoundService } from '@/lib/rounds/service';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

const roundService = new RoundService();

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type');
    if (!type) {
      throw new ValidationError('type parameter is required');
    }

    const round = await roundService.getCurrentRound(type as any);

    if (!round) {
      throw new NotFoundError('Active Round', type);
    }

    return createSuccessResponse({ round });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**예상 시간**: 20분

---

**GET /api/rounds/:id** 구현:

1. `app/api/rounds/[id]/route.ts` 생성:
```typescript
import { NextRequest } from 'next/server';
import { RoundService } from '@/lib/rounds/service';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

const roundService = new RoundService();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const round = await roundService.getRoundById(params.id);
    return createSuccessResponse({ round });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**예상 시간**: 10분

---

### 우선순위 2: Bets API (내일)

동일한 패턴으로 구현:

```bash
mkdir -p lib/bets
touch lib/bets/types.ts
touch lib/bets/constants.ts
touch lib/bets/validation.ts
touch lib/bets/repository.ts
touch lib/bets/service.ts
```

**참고**: `lib/rounds/*`를 템플릿으로 사용

**예상 시간**: 2시간

---

### 우선순위 3: 팀원 공유 (내일)

1. Slack/Notion에 공유:
   - ARCHITECTURE_GUIDE.md
   - REFACTORING_GUIDE.md
   - 이 Quick Start 가이드

2. 30분 세션:
   - 리팩토링 배경 설명
   - 코드 워크스루
   - Q&A

---

## 🔍 문제 발생 시

### 빌드 에러: "Cannot find module 'zod'"

```bash
npm install zod
```

### 빌드 에러: "Cannot find module '@/lib/rounds/service'"

TypeScript path alias 확인:
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### 런타임 에러: "getDb is not a function"

`lib/db/index.ts` 확인:
```typescript
export function getDb() {
  // ...
}
```

---

## 📚 학습 자료

### 1. 원본 코드 분석 (1시간)

`app/api/rounds/route.commented.ts` 읽기
- 상세 주석으로 모든 로직 설명
- 문제점 파악

### 2. 아키텍처 이해 (30분)

`ARCHITECTURE_GUIDE.md` 읽기
- Layered Architecture
- 각 레이어의 책임
- 코딩 컨벤션

### 3. 리팩토링 비교 (30분)

`REFACTORING_GUIDE.md` 읽기
- Before/After 비교
- 메트릭 분석
- 테스트 전략

---

## 💡 팁

### 1. 점진적 적용

**Option A**: 새 API부터 적용
- 기존 route.ts는 그대로 두고
- GET /api/rounds/current부터 새 패턴 적용
- 리스크 최소화

**Option B**: 전체 리팩토링
- 오늘 당장 route.ts 교체
- 더 일관된 구조
- 약간의 리스크

**권장**: Option A (안전)

### 2. 테스트 작성

Jest 설치:
```bash
npm install -D jest @types/jest ts-jest
```

Service 테스트 예시:
```typescript
// lib/rounds/service.test.ts
import { RoundService } from './service';
import { ValidationError } from '@/lib/shared/errors';

describe('RoundService', () => {
  it('should throw ValidationError for invalid page', async () => {
    const service = new RoundService();
    await expect(service.getRounds({ page: -1 })).rejects.toThrow(ValidationError);
  });
});
```

### 3. 코드 리뷰

팀원 코드 리뷰 시 체크:
- [ ] Controller는 HTTP만 처리하는가?
- [ ] Service에 비즈니스 로직이 있는가?
- [ ] Repository에서만 DB 접근하는가?
- [ ] Zod로 입력 검증하는가?
- [ ] handleApiError로 에러 처리하는가?

---

## 🎉 완료 후

### 성과 측정

- [ ] 코드 라인 수 감소 확인
- [ ] API 응답 시간 측정 (Before/After)
- [ ] 버그 발생률 추적
- [ ] 새 API 구현 시간 측정

### 팀 공유

- [ ] README.md 업데이트
- [ ] Wiki에 베스트 프랙티스 등록
- [ ] 다른 도메인(bets, users)에 적용

---

## 📞 질문/피드백

리팩토링 관련 질문이나 개선 아이디어가 있다면:
- Slack #dev 채널
- GitHub Issues
- 직접 코드 리뷰 요청

**참고 문서**:
- [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md)
- [REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md)
- [API_SPECIFICATION.md](./API_SPECIFICATION.md)
