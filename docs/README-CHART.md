# 차트 모듈 문서 센터

> DeltaX 프로젝트 - 차트 시각화 모듈 통합 문서

**담당자**: 김현준
**마지막 업데이트**: 2025-11-11

---

## 🚀 Quick Links

### 📖 시작하기
- [구현 가이드](./chart-implementation-guide.md) - 개발자를 위한 시작 가이드

### 🗄️ 설계 문서
- [ERD 다이어그램](./chart-erd-diagram.md) - 데이터베이스 스키마 및 관계
- [UI 목업](./chart-ui-mockup.md) - 화면 설계 및 컴포넌트 구조

### 💻 코드
- [데이터베이스 스키마](../db/schema/index.ts) - Drizzle ORM 스키마 (Line 66~195)

---

## 📋 문서 개요

### 1. [ERD 다이어그램](./chart-erd-diagram.md)
**대상**: 백엔드 개발자, DBA
**내용**:
- 3개 테이블 스키마 (ChartData, VolatilitySnapshots, BettingMarkers)
- 인덱스 전략 및 쿼리 최적화
- 데이터 흐름도
- 샘플 데이터 및 마이그레이션 가이드

**주요 테이블**:
```sql
chart_data          -- OHLCV 캔들스틱 데이터
volatility_snapshots -- 변동성 지표 캐시
betting_markers     -- 베팅 마커 (베팅 시스템 연동)
```

### 2. [UI 목업](./chart-ui-mockup.md)
**대상**: 프론트엔드 개발자, 디자이너
**내용**:
- Desktop/Mobile 레이아웃 (ASCII Art)
- 컴포넌트 구조도 (Mermaid)
- 상태 흐름도
- 인터랙션 플로우
- 접근성(A11y) 가이드

**주요 컴포넌트**:
```
ChartContainer
├── ChartHeader     (필터/설정)
├── PriceChart      (가격 차트)
├── VolatilityPanel (변동성 지표)
└── BettingWidget   (베팅 위젯)
```

### 3. [구현 가이드](./chart-implementation-guide.md)
**대상**: 개발팀 전체
**내용**:
- 구현 우선순위 (Week 2, Week 3)
- 데이터베이스 마이그레이션 방법
- API 엔드포인트 구현 예제
- 컴포넌트 구현 예제
- WebSocket 구현 가이드
- 테스트 가이드
- 트러블슈팅

---

## 🎯 담당 범위

### 차트 모듈 책임
1. **실시간 가격 데이터 수집**
   - PAXG, BTC, ETH, SOL 가격 추적
   - WebSocket 스트리밍
   - 외부 API (CoinGecko, Binance) 연동

2. **차트 시각화**
   - 캔들스틱/라인/영역 차트
   - 변동성 지표 (RSI, 볼린저 밴드, MACD)
   - 듀얼/오버레이/싱글 뷰 모드

3. **베팅 시스템 연동**
   - 차트 위 베팅 마커 표시
   - 베팅 결과 시각화

### 제공 API
```
GET  /api/chart/price/:asset     # 최신 가격
GET  /api/chart/historical        # 과거 데이터
GET  /api/chart/volatility        # 변동성 지표
WS   /api/chart/realtime          # 실시간 스트림
```

### 의존 모듈
- **김도영 (유저/지갑)**: User.id (베팅 마커 식별)
- **장태웅 (베팅)**: BettingRound, Bet (마커 데이터)

---

## 🛠️ 기술 스택

### 데이터베이스
- **ORM**: Drizzle ORM
- **DB**: SQLite (Cloudflare D1)
- **마이그레이션**: drizzle-kit

### 프론트엔드
- **차트**: Recharts
- **상태 관리**: Zustand
- **실시간 통신**: Socket.io
- **UI**: shadcn/ui + Tailwind CSS

### 백엔드
- **API**: Next.js App Router
- **WebSocket**: Socket.io Server
- **외부 API**: CoinGecko, Binance

---

## 📅 개발 일정

### Week 1 (11/5 - 11/11): 설계 ✅
- [x] ERD 설계
- [x] UI 목업
- [x] 기술 스택 선정
- [x] 문서 작성

### Week 2 (11/12 - 11/18): 기본 기능
- [ ] 데이터베이스 마이그레이션
- [ ] API 엔드포인트 (price, historical)
- [ ] PriceChart 컴포넌트
- [ ] useChartStore 상태 관리

### Week 3 (11/19 - 11/25): 핵심 기능
- [ ] WebSocket 실시간 스트리밍
- [ ] 변동성 지표 계산
- [ ] 베팅 마커 연동
- [ ] VolatilityPanel 컴포넌트

---

## 🔄 워크플로우

### 신규 개발자 온보딩
```
1. 이 문서 (README-CHART.md) 읽기
   ↓
2. 구현 가이드 읽기
   ↓
3. ERD 다이어그램 확인
   ↓
4. UI 목업 확인
   ↓
5. 개발 환경 설정
   ↓
6. Week 2 태스크 시작
```

### 코드 리뷰 프로세스
```
1. 기능 구현
   ↓
2. 자체 테스트
   ↓
3. PR 생성 (템플릿 사용)
   ↓
4. 팀원 리뷰 (최소 1명)
   ↓
5. 승인 후 Merge
```

---

## 📊 프로젝트 통계

### 코드 현황
- **스키마 파일**: 1개 (db/schema/index.ts)
- **테이블**: 3개 (ChartData, VolatilitySnapshots, BettingMarkers)
- **예상 API**: 5개
- **예상 컴포넌트**: 10개

### 문서 현황
- **설계 문서**: 3개
- **총 문서 크기**: ~55KB
- **마지막 업데이트**: 2025-11-11

---

## 🐛 이슈 트래킹

### 알려진 이슈
_현재 없음 (개발 진행 전)_

### 이슈 보고 방법
1. GitHub Issues 생성
2. Label: `chart`, `bug` / `feature` / `docs`
3. Assignee: @hyeonjun

---

## 💡 팁 & 베스트 프랙티스

### 1. 데이터 조회 최적화
```typescript
// ✅ Good: 인덱스 활용
await db.select()
  .from(chartData)
  .where(
    eq(chartData.asset, 'BTC'),
    gte(chartData.timestamp, startTime)
  )
  .orderBy(asc(chartData.timestamp));

// ❌ Bad: 전체 스캔
await db.select()
  .from(chartData)
  .where(sql`asset = 'BTC'`); // 인덱스 활용 안 됨
```

### 2. 컴포넌트 최적화
```typescript
// ✅ Good: React.memo 사용
export const PriceChart = React.memo(({ asset }) => {
  // ...
});

// ✅ Good: useMemo로 데이터 변환
const chartData = useMemo(() => {
  return rawData.map(transformData);
}, [rawData]);
```

### 3. WebSocket 연결 관리
```typescript
// ✅ Good: 재연결 로직
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// ✅ Good: 컴포넌트 언마운트 시 정리
useEffect(() => {
  const socket = connect();
  return () => socket.disconnect();
}, []);
```

---

## 📞 연락처

**담당자**: 김현준
**역할**: 차트 모듈 개발
**GitHub**: @hyeonjun (예시)
**Email**: example@email.com (예시)

**질문/요청**:
- 설계 관련: [ERD 문서](./chart-erd-diagram.md) 참고 후 질문
- 구현 관련: [구현 가이드](./chart-implementation-guide.md) 참고
- 버그/이슈: GitHub Issues

---

## 📚 추가 리소스

### 외부 문서
- [Drizzle ORM 공식 문서](https://orm.drizzle.team/)
- [Recharts 공식 문서](https://recharts.org/)
- [Socket.io 공식 문서](https://socket.io/docs/)
- [Zustand 공식 문서](https://zustand-demo.pmnd.rs/)

### 프로젝트 문서
- [프로젝트 전체 README](../README.md)
- [데이터베이스 가이드](./DRIZZLE_D1_GUIDE.md)
- [Quick Start](./QUICK_START.md)

---

## 🔄 문서 변경 이력

| 날짜 | 버전 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 2025-11-11 | 1.0 | 초안 작성 및 문서 센터 구축 | 김현준 |

---

**문서 상태**: ✅ 완료
**다음 업데이트**: Week 2 개발 시작 시
