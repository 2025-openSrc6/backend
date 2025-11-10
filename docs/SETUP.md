# 팀 개발 환경 설정 가이드

## 🎯 개요

이 프로젝트는 Cloudflare D1 데이터베이스를 사용합니다. 모든 팀원이 동일한 환경에서 작업하기 위해 다음 단계를 따르세요.

## 📋 필수 요구사항

- Node.js v20 이상
- npm 10 이상
- Git

## 🚀 초기 설정 (팀원 모두 필수)

### 1. 프로젝트 클론

```bash
git clone <repository-url>
cd backend
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env.example` 파일을 참고하여 `.env.local` 파일을 생성하세요:

```bash
cp .env.example .env.local
```

`.env.local` 파일에 다음을 추가하세요 (팀 리드에게 요청):

```
CLOUDFLARE_D1_ID=<YOUR_D1_ID>
```

> ⚠️ `CLOUDFLARE_D1_ID`는 팀 리드에게 별도로 요청하세요. Git에 커밋하지 마세요!

### 4. 개발 서버 시작

```bash
npm run dev
```

서버가 `http://localhost:3000`에서 실행됩니다.

## 📊 데이터 추가 방법

### 방법 1: REST API를 통한 추가 (권장) ⭐

#### A. cURL 사용 (CLI)

**라운드 추가:**
```bash
curl -X POST http://localhost:3000/api/rounds \
  -H "Content-Type: application/json" \
  -d '{
    "roundKey": "round-2025-01-10-1h",
    "timeframe": "1h",
    "lockingStartsAt": "2025-01-10T10:00:00Z",
    "lockingEndsAt": "2025-01-10T11:00:00Z"
  }'
```

**베팅 추가:**
```bash
curl -X POST http://localhost:3000/api/bets \
  -H "Content-Type: application/json" \
  -d '{
    "roundId": 1,
    "walletAddress": "0x1111111111111111111111111111111111111111",
    "selection": "gold",
    "amount": "100.50"
  }'
```

#### B. Postman 사용 (GUI)

**Postman 설치:**
- https://www.postman.com/downloads/ 에서 다운로드

**라운드 추가:**
1. Postman 열기
2. `POST` 선택
3. URL: `http://localhost:3000/api/rounds`
4. `Body` → `raw` → `JSON` 선택
5. 다음 JSON 입력:
```json
{
  "roundKey": "round-2025-01-10-1h",
  "timeframe": "1h",
  "lockingStartsAt": "2025-01-10T10:00:00Z",
  "lockingEndsAt": "2025-01-10T11:00:00Z"
}
```
6. `Send` 버튼 클릭

**베팅 추가:**
1. URL: `http://localhost:3000/api/bets`
2. JSON 입력:
```json
{
  "roundId": 1,
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "selection": "gold",
  "amount": "100.50"
}
```
3. `Send` 버튼 클릭

### 방법 2: 웹 UI를 통한 추가

프로젝트의 페이지에서 제공하는 폼을 통해 데이터를 추가할 수 있습니다.

## 📱 API 엔드포인트

### 라운드 (Rounds)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/rounds` | 모든 라운드 조회 |
| POST | `/api/rounds` | 새 라운드 생성 |

**라운드 객체 예제:**
```json
{
  "roundKey": "round-2025-01-10-1h",
  "timeframe": "1h",
  "status": "scheduled",
  "lockingStartsAt": "2025-01-10T10:00:00Z",
  "lockingEndsAt": "2025-01-10T11:00:00Z"
}
```

### 베팅 (Bets)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/bets?roundId=1` | 라운드별 베팅 조회 |
| POST | `/api/bets` | 새 베팅 생성 |

**베팅 객체 예제:**
```json
{
  "roundId": 1,
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "selection": "gold",
  "amount": "100.50",
  "txDigest": "optional_tx_hash"
}
```

### 헬스 체크

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/health` | DB 연결 상태 확인 |

## 🔧 일반적인 작업

### DB 연결 확인

```bash
curl http://localhost:3000/api/health
```

### 모든 라운드 조회

```bash
curl http://localhost:3000/api/rounds
```

### 특정 라운드의 베팅 조회

```bash
curl "http://localhost:3000/api/bets?roundId=1"
```

### 새 라운드 생성 및 응답 보기

```bash
curl -X POST http://localhost:3000/api/rounds \
  -H "Content-Type: application/json" \
  -d '{
    "roundKey": "round-001",
    "timeframe": "1h",
    "lockingStartsAt": "2025-01-10T10:00:00Z",
    "lockingEndsAt": "2025-01-10T11:00:00Z"
  }' | jq '.'
```

## 🐛 트러블슈팅

### "포트 3000이 이미 사용 중입니다"

```bash
# 다른 포트 사용
npm run dev -- -p 3001
```

### "D1 database not available" 에러

- `.env.local` 파일이 존재하는지 확인
- `CLOUDFLARE_D1_ID` 값이 올바른지 확인
- 서버를 재시작하세요

### 응답이 없습니다

- 개발 서버가 실행 중인지 확인: `npm run dev`
- URL이 정확한지 확인 (포트 번호 포함)
- 브라우저 개발자도구에서 네트워크 탭 확인

## 📚 추가 문서

- [DB_USAGE.md](./DB_USAGE.md) - 데이터베이스 상세 문서

## 💬 질문이 있으신가요?

팀 채널에서 질문하거나 리드 개발자에게 문의하세요.

---

**마지막 업데이트:** 2025-01-10
