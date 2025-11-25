# Cron Job 의사결정 기록

> 작성일: 2025-11-25
> 작성자: 장태웅 + AI 멘토

이 문서는 `CRON_JOB_SPECIFICATION.md` 구현 전 논의된 의사결정 사항들을 기록합니다.

---

## 📋 목차

1. [의사결정 요약](#의사결정-요약)
2. [상세 결정 사항](#상세-결정-사항)
3. [수정된 파일 목록](#수정된-파일-목록)
4. [향후 고려사항](#향후-고려사항)

---

## 의사결정 요약

| 항목              | 결정                   | 이유                                         |
| ----------------- | ---------------------- | -------------------------------------------- |
| 배치 처리         | ❌ Week 1 스킵         | 초기 유저 수 적음, 나중에 추가               |
| 가격 API 실패     | CANCEL 처리            | 현준님 API에서 fallback 처리, 내 쪽은 단순화 |
| Job 2/4 동시 실행 | Job 4 먼저, Job 2 이후 | 이전 라운드 정산이 더 중요                   |
| DELAYED 상태      | ❌ 도입 안 함          | 상태 복잡도 증가 방지                        |
| DRAW (무승부)     | ❌ 제거                | 동률 시 금 승리로 단순화                     |
| 관리자 API        | 별도 명세로 분리       | 우선순위 낮음                                |
| Sui 필드 (Week 1) | Mock/옵셔널            | Week 2에서 실제 값으로 교체                  |

---

## 상세 결정 사항

### 1. 배치 처리 (Job 5: Settlement)

**문제**

- Cloudflare Workers CPU 타임 제한 (30초)
- 다수 베팅 처리 시 타임아웃 가능성

**결정: Week 1에서 스킵**

**근거**

- 초기 유저 수가 적어 한 라운드에 100개 베팅도 어려움
- 30초면 100개 정산 충분
- 문제 발생 시 그때 배치 처리 추가 (YAGNI)

**향후 조치**

- 유저 증가 시 배치 처리 추가
- `BATCH_SIZE` 환경변수로 제어

---

### 2. 가격 API 실패 시 처리

**문제**

- 가격 API (현준님) 호출 실패 시 라운드 진행 불가
- DELAYED 상태 도입? 재시도 로직 추가?

**결정: 실패 시 CANCEL + 현준님 API에서 fallback 처리**

**책임 분리**

```
현준님 API 역할:
├─ Kitco/CoinGecko 호출
├─ 실패 시 → 캐시된 가격 반환 (10분 이내)
└─ 캐시도 없으면 → Error 반환

내 역할:
├─ getPrices() 호출
├─ 성공 → 진행
└─ 실패 → CANCEL (단순!)
```

**현준님께 요청할 것**

- API 응답에 `isFallback: boolean` 필드 추가
- 10분 이내 캐시 fallback 구현
- 짧은 캐싱 (30초~1분) - Job 4, Job 2가 같은 가격 받도록

**근거**

- 관심사 분리 (SoC)
- Cron Job 로직 단순화
- 복잡한 재시도 로직 불필요

---

### 3. Job 2/4 동시 실행 순서

**문제**

- Job 2 (Round Opener)와 Job 4 (Round Finalizer)가 같은 시각 실행
- 둘 다 가격 API 호출 → Rate limit 위험
- 실행 순서 미보장

**결정: Job 4 먼저 실행, Job 2 이후 실행**

**구현**

```typescript
// app/api/cron/scheduled/route.ts
if (minute === 0 && ROUND_START_HOURS_UTC.includes(hour)) {
  // Job 4: 이전 라운드 종료/정산 (먼저 실행)
  await callCronJob('/api/cron/rounds/finalize');

  // Job 2: 새 라운드 시작 (이후 실행)
  await callCronJob('/api/cron/rounds/open');
}
```

**근거**

- Job 4 (정산)이 더 중요 - 돈이 걸림
- Job 2 (새 라운드 시작)는 10초 늦어도 문제없음
- 순차 실행으로 가격 API 경합 방지

---

### 4. DELAYED 상태

**문제**

- `specification.md`에서 가격 API 실패 시 DELAYED 상태 언급
- FSM에는 DELAYED 상태 없음

**결정: DELAYED 도입 안 함**

**근거**

- 상태가 많아질수록 전이 로직 복잡해짐
- 가격 실패 → 바로 CANCELLED가 더 단순
- DELAYED 상태면 "언제까지 기다릴지" 정책 필요 → 추가 복잡도

**대안**

- 가격 API 실패 → CANCELLED
- 현준님 API에서 fallback 처리로 실패 확률 최소화

---

### 5. 무승부 (DRAW) 제거

**문제**

- DRAW 시 전액 환불 → 별도 로직 필요
- VOIDED 상태로 전이 → FSM 복잡
- 0.01% 임계값 → 실제 DRAW 발생 확률 거의 0%

**결정: DRAW 제거, 동률 시 금 승리**

**구현**

```typescript
// lib/rounds/calculator.ts
export function determineWinner(params: DetermineWinnerParams): DetermineWinnerResult {
  const goldChangePercent = ((goldEnd - goldStart) / goldStart) * 100;
  const btcChangePercent = ((btcEnd - btcStart) / btcStart) * 100;

  // 금 변동률 >= 비트 변동률 → 금 승리 (동률 시 금)
  const winner: RoundWinner = goldChangePercent >= btcChangePercent ? 'GOLD' : 'BTC';

  return { winner, goldChangePercent, btcChangePercent };
}
```

**근거**

- 환불 로직 불필요
- VOIDED 상태 사용 빈도 감소 (시스템 오류 시만)
- 항상 승자/패자 존재 → 정산 로직 단순화
- UI에 "동률 시 금 승리" 공지만 추가

**VOIDED 상태 용도 변경**

- DRAW 때 사용하던 것 → 시스템 오류로 정산 불가 시만 사용

---

### 6. Sui 필드 처리 (Week 1)

**문제**

- FSM 필수 필드에 `suiPoolAddress`, `suiSettlementObjectId` 있음
- Week 1에서는 Sui 통합 전이라 실제 값 없음

**결정: Week 1에서 옵셔널 처리**

**수정 내용**

```typescript
// lib/rounds/fsm.ts
case 'SCHEDULED_BETTING_OPEN':
  validateRequired(metadata, [
    'goldStartPrice',
    'btcStartPrice',
    'priceSnapshotStartAt',
    'startPriceSource',
    // 'suiPoolAddress', // TODO: Week 2에서 필수로 변경
    'bettingOpenedAt',
  ]);
  break;
```

```typescript
// lib/rounds/types.ts
export interface OpenRoundMetadata {
  // ...
  suiPoolAddress?: string; // Week 2까지 옵셔널
}
```

**향후 조치**

- Week 2 (Sui 통합) 시 주석 해제
- `suiPoolAddress`, `suiSettlementObjectId` 필수로 변경

---

### 7. 테스트 전략

**문제**

- 6시간 라운드를 어떻게 테스트?

**결정: 유닛 테스트 + curl 수동 테스트**

**테스트 방법**

```bash
# 유닛 테스트 (비즈니스 로직)
npm run test

# curl로 수동 테스트
curl -X POST http://localhost:3000/api/cron/rounds/create \
  -H "X-Cron-Secret: your-secret"
```

**테스트 시나리오**

1. `create` → SCHEDULED 라운드 생성 확인
2. `open` → BETTING_OPEN + 가격 스냅샷 확인
3. `lock` → BETTING_LOCKED 확인
4. `finalize` → 승자 판정 확인
5. `settle` → 정산 완료 확인

---

### 8. 설정 분리

**결정: 환경변수 + constant 파일 분리**

| 항목                | 위치     | 이유                     |
| ------------------- | -------- | ------------------------ |
| 플랫폼 수수료율     | 환경변수 | 배포 후 변경 가능해야 함 |
| 재시도 횟수/딜레이  | 환경변수 | 상황에 따라 조절         |
| FSM 전이 규칙       | constant | 코드와 함께 변경됨       |
| 라운드 시간 (6시간) | constant | 잘 안 바뀜               |

**생성 파일**: `lib/config/cron.ts`

---

## 수정된 파일 목록

### 신규 생성

| 파일                              | 설명                          |
| --------------------------------- | ----------------------------- |
| `lib/rounds/calculator.ts`        | 승자 판정 + 배당 계산 로직    |
| `lib/config/cron.ts`              | Cron 설정값 (상수 + 환경변수) |
| `app/api/cron/scheduled/route.ts` | Cloudflare Cron Handler       |
| `docs/ehdnd/CRON_DECISIONS.md`    | 의사결정 기록 (이 문서)       |

### 수정

| 파일                  | 변경 내용                                                    |
| --------------------- | ------------------------------------------------------------ |
| `lib/rounds/fsm.ts`   | `suiPoolAddress`, `suiSettlementObjectId` 옵셔널 처리        |
| `lib/rounds/types.ts` | `suiPoolAddress` 옵셔널, `RoundWinner` 타입 추가 (DRAW 제거) |

---

## 향후 고려사항

### Week 2 (Sui 통합) 시 해야 할 것

1. **FSM 필수 필드 복원**
   - `suiPoolAddress` 필수로 변경
   - `suiSettlementObjectId` 필수로 변경

2. **배치 처리 검토**
   - 유저 증가 시 Job 5에 배치 처리 추가

3. **D1↔Sui 정합성 검증**
   - 검증 스크립트 추가 (매일 실행)

### 나중에 해도 되는 것

- 관리자 강제 개입 API (`ADMIN_API_SPECIFICATION.md`)
- 테스트용 시간 단축 설정
- 구조화된 로깅 표준화

### 현준님께 요청할 것

1. **가격 API fallback 구현**
   - 실패 시 10분 이내 캐시 반환
   - `isFallback: boolean` 필드 추가

2. **가격 API 캐싱**
   - 30초~1분 캐싱
   - Job 4, Job 2가 같은 가격 받도록

---

## 결론

**핵심 원칙**: 지금 필요한 것만, 단순하게

- 복잡한 기능은 필요할 때 추가 (YAGNI)
- 상태와 분기는 최소화
- 책임 분리 (가격 fallback은 현준님 API 담당)

이 결정들로 Week 1 구현 복잡도를 크게 줄이고, 핵심 기능에 집중할 수 있습니다.
