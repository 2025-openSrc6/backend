# 🚀 빠른 시작 가이드 (팀원용)

## 5분 안에 시작하기

### 1️⃣ 프로젝트 준비 (처음 한 번만)

```bash
# 클론
git clone <repo>
cd backend

# 설치
npm install

# 환경 설정 (상세 내용은 SETUP.md 참고)
cp .env.example .env.local

# .env.local 파일을 열어서 팀 리드에게 받은 CLOUDFLARE_D1_ID 값 입력
```

### 2️⃣ 개발 서버 시작

```bash
npm run dev
```

✅ `http://localhost:3000` 에서 실행 중

### 3️⃣ 데이터 추가 (3가지 방법)

#### 방법 A: cURL (터미널)

```bash
# 라운드 추가
curl -X POST http://localhost:3000/api/rounds \
  -H "Content-Type: application/json" \
  -d '{"roundKey":"round-001","timeframe":"1h","lockingStartsAt":"2025-01-10T10:00:00Z","lockingEndsAt":"2025-01-10T11:00:00Z"}'

# 베팅 추가
curl -X POST http://localhost:3000/api/bets \
  -H "Content-Type: application/json" \
  -d '{"roundId":1,"walletAddress":"0x1111111111111111111111111111111111111111","selection":"gold","amount":"100.50"}'
```

#### 방법 B: Postman (GUI)

1. [Postman 다운로드](https://www.postman.com/downloads/)
2. `postman_collection.json` 임포트
3. 값 수정 후 `Send`

#### 방법 C: 웹 UI (향후 추가)

## 📊 자주 사용할 API

### 모든 라운드 보기
```bash
curl http://localhost:3000/api/rounds
```

### 라운드 1의 베팅 보기
```bash
curl "http://localhost:3000/api/bets?roundId=1"
```

### DB 연결 확인
```bash
curl http://localhost:3000/api/health
```

## 📝 라운드 추가 예제

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

**응답 예시:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "roundKey": "round-2025-01-10-1h",
      "timeframe": "1h",
      "status": "scheduled",
      "createdAt": "2025-01-10T09:30:00.000Z"
    }
  ]
}
```

## 💰 베팅 추가 예제

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

## ⚠️ 일반적인 실수

| 에러 | 해결 방법 |
|------|---------|
| `Port 3000 already in use` | `npm run dev -- -p 3001` |
| `Cannot find .env.local` | `cp .env.example .env.local` |
| `D1 database not available` | `.env.local` 파일 확인 및 CLOUDFLARE_D1_ID 확인 |
| `roundId not found` | 먼저 라운드를 만들고 반환된 ID 사용 |

## 🔗 더 자세한 정보

- [SETUP.md](./SETUP.md) - 전체 설정 가이드
- [DB_USAGE.md](./DB_USAGE.md) - DB 상세 문서

## 💬 문제 발생 시

1. 이 문서에서 해결 방법 찾기
2. [SETUP.md](./SETUP.md) 의 트러블슈팅 확인
3. 팀 채널에 질문

---

**Happy coding! 🎉**
