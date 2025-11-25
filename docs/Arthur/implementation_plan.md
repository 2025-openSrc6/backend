# NFT Shop 구현 계획

## 목표

NFT Shop 기능을 구현하여 사용자가 닉네임, 색상, NFT, 부스트 아이템 등을 조회하고 DEL 또는 CRYSTAL로 구매할 수 있도록 합니다. 상점 아이템 목록 조회, 구매 처리, 보유 아이템 조회 API를 포함합니다.

## 검토 필요 사항

> [!IMPORTANT]
> **DB 테이블 방식 사용**: 상점 아이템을 DB 테이블(`shop_items`)로 관리합니다.
> 
> **Sui NFT 민팅 모킹**: 로드맵에 따라 Week 3 이전까지는 실제 Sui NFT 민팅 없이 mock으로 처리합니다.

## 제안된 변경사항

### 데이터베이스

#### [NEW] [db/schema/shopItems.ts](file:///c:/2025-openSrc6/backend/db/schema/shopItems.ts)

상점 아이템 테이블 스키마 정의:

```typescript
export const shopItems = sqliteTable('shop_items', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // 'NICKNAME' | 'COLOR' | 'NFT' | 'BOOST' | 'ITEM'
  name: text('name').notNull(),
  description: text('description'),
  price: integer('price').notNull(),
  currency: text('currency').notNull(), // 'DEL' | 'CRYSTAL'
  tier: text('tier'), // NFT용: 'A' | 'B' | 'C' | 'D' | 'E'
  metadata: text('metadata'), // JSON string (색상 코드, 효과 등)
  imageUrl: text('image_url'),
  available: integer('available', { mode: 'boolean' }).default(true),
  requiresNickname: integer('requires_nickname', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at').notNull(),
});
```

**주요 필드 설명**:
- `category`: 아이템 카테고리 (닉네임, 색상, NFT 등)
- `price`, `currency`: 가격 및 사용 화폐
- `tier`: NFT 등급 (A~E)
- `metadata`: JSON 형태로 추가 속성 저장
- `requiresNickname`: 구매 전 닉네임 필요 여부 (델타 품목용)

---

#### [MODIFY] [db/schema/index.ts](file:///c:/2025-openSrc6/backend/db/schema/index.ts)

`shopItems` 테이블 export 추가:

```typescript
export * from './shopItems';
```

---

### 시드 데이터

#### [NEW] [scripts/seed-shop-items.ts](file:///c:/2025-openSrc6/backend/scripts/seed-shop-items.ts)

`docs/nft_shop.md`를 기반으로 초기 상점 아이템 데이터 생성:

```typescript
const initialItems = [
  // --- 닉네임 & 컬러 ---
  {
    id: 'item_nickname',
    category: 'NICKNAME',
    name: '닉네임 변경권',
    description: '닉네임을 설정할 수 있습니다.',
    price: 50000,
    currency: 'DEL',
    requiresNickname: false,
  },
  {
    id: 'item_color_single',
    category: 'COLOR',
    name: '닉네임 컬러 (단색)',
    description: '닉네임에 단색 컬러를 적용합니다.',
    price: 20000,
    currency: 'DEL',
    requiresNickname: true,
  },
  {
    id: 'item_color_special',
    category: 'COLOR',
    name: '닉네임 컬러 (스페셜)',
    description: '2중/3중/무지개 컬러를 적용합니다.',
    price: 100000,
    currency: 'DEL',
    requiresNickname: true,
  },

  // --- NFT Tiers ---
  {
    id: 'nft_obsidian',
    category: 'NFT',
    name: 'Obsidian Tier NFT',
    tier: 'Obsidian',
    price: 300000,
    currency: 'DEL',
  },
  {
    id: 'nft_aurum',
    category: 'NFT',
    name: 'Aurum Tier NFT',
    tier: 'Aurum',
    price: 500000,
    currency: 'DEL',
  },
  {
    id: 'nft_nova',
    category: 'NFT',
    name: 'Nova Tier NFT',
    tier: 'Nova',
    price: 1000000,
    currency: 'DEL',
  },
  {
    id: 'nft_aetherion',
    category: 'NFT',
    name: 'Aetherion Tier NFT',
    tier: 'Aetherion',
    price: 2000000,
    currency: 'DEL',
  },
  {
    id: 'nft_singularity',
    category: 'NFT',
    name: 'Singularity Tier NFT',
    tier: 'Singularity',
    price: 100000000,
    currency: 'DEL',
  },

  // --- 아이템 (Crystal) ---
  {
    id: 'item_boost_1day',
    category: 'BOOST',
    name: '부스트 토큰 (1일)',
    description: '1일간 베팅 성공 보상 +5%, 출석 포인트 +10%',
    price: 2,
    currency: 'CRYSTAL',
  },
  {
    id: 'item_green_mushroom',
    category: 'ITEM',
    name: 'Green Mushroom',
    description: '베팅 실패 시 투자 금액 50% 회수 (1회)',
    price: 2,
    currency: 'CRYSTAL',
  },
];
```

---

### API 구현

#### [NEW] [app/api/nfts/shop/route.ts](file:///c:/2025-openSrc6/backend/app/api/nfts/shop/route.ts)

**엔드포인트**: `GET /api/nfts/shop`

**기능**: 상점에서 판매 중인 아이템 목록 조회

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "item_nickname",
        "category": "NICKNAME",
        "name": "닉네임",
        "price": 50000,
        "currency": "DEL"
      }
    ]
  }
}
```

**구현 로직**:
1. DB에서 `available = true`인 아이템 조회
2. 카테고리별로 그룹화 (선택적)
3. JSON 응답 반환

---

#### [NEW] [app/api/nfts/purchase/route.ts](file:///c:/2025-openSrc6/backend/app/api/nfts/purchase/route.ts)

**엔드포인트**: `POST /api/nfts/purchase`

**기능**: 상점 아이템 구매

**요청 본문**:
```json
{
  "userId": "user-uuid",
  "itemId": "item_nickname"
}
```

**구현 로직**:
1. 아이템 정보 조회 (`shop_items` 테이블)
2. 유저 잔액 조회 (`users` 테이블)
3. **검증**:
   - 잔액 충분한지 확인
   - 닉네임 필요 아이템인 경우, 유저가 닉네임 보유 여부 확인
   - 이미 구매한 아이템인지 확인 (중복 구매 방지)
4. **트랜잭션 실행**:
   ```typescript
   db.transaction(async (tx) => {
     // 1. 유저 잔액 차감
     await tx.update(users)
       .set({ delBalance: user.delBalance - item.price })
       .where(eq(users.id, userId));
     
     // 2. 포인트 거래 기록
     await tx.insert(pointTransactions).values({
       userId,
       type: 'NFT_PURCHASE',
       currency: item.currency,
       amount: -item.price,
       balanceBefore: user.delBalance,
       balanceAfter: user.delBalance - item.price,
       referenceId: item.id,
       referenceType: 'SHOP_ITEM',
     });
     
     // 3. 아이템 지급 (achievements 테이블)
     await tx.insert(achievements).values({
       userId,
       type: item.category,
       tier: item.tier,
       name: item.name,
       purchasePrice: item.price,
       currency: item.currency,
       acquiredAt: Date.now(),
     });
   });
   ```
5. 성공 응답 반환

**응답 예시** (성공):
```json
{
  "success": true,
  "data": {
    "item": { ... },
    "newBalance": 450000
  }
}
```

**에러 케이스**:
- 잔액 부족: `400 INSUFFICIENT_BALANCE`
- 닉네임 미보유: `400 NICKNAME_REQUIRED`
- 중복 구매: `400 ALREADY_OWNED`

---

#### [NEW] [app/api/nfts/my/route.ts](file:///c:/2025-openSrc6/backend/app/api/nfts/my/route.ts)

**엔드포인트**: `GET /api/nfts/my`

**기능**: 유저가 보유한 아이템 조회

**쿼리 파라미터**:
```
userId=user-uuid
```

**구현 로직**:
1. `achievements` 테이블에서 해당 유저의 아이템 조회
2. 카테고리별로 그룹화 (선택적)

**응답 예시**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "achievement-uuid",
        "type": "NFT",
        "tier": "A",
        "name": "Cyber Dragon",
        "acquiredAt": 1700000000000
      }
    ]
  }
}
```

---

## 검증 계획

### 로컬 개발 환경 준비

```bash
# 1. DB 스키마 생성 및 마이그레이션
npm run db:generate
npm run db:migrate:local

# 2. 시드 데이터 실행
npm run seed:shop

# 3. 개발 서버 실행
npm run dev
```

### 테스트 시나리오

#### 1. 상점 아이템 목록 조회

```bash
curl http://localhost:3000/api/nfts/shop
```

**검증**:
- `docs/nft_shop.md`에 정의된 아이템 목록이 반환되는지 확인
- 카테고리, 가격, 화폐 정보가 정확한지 확인

---

#### 2. 아이템 구매 (성공)

```bash
curl -X POST http://localhost:3000/api/nfts/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "itemId": "item_nickname"
  }'
```

**검증**:
- 응답이 성공 상태인지 확인
- 유저 잔액이 정확히 차감되었는지 DB에서 확인
- `achievements` 테이블에 아이템이 추가되었는지 확인
- `point_transactions` 테이블에 거래 기록이 남았는지 확인

---

#### 3. 아이템 구매 (잔액 부족)

```bash
curl -X POST http://localhost:3000/api/nfts/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "poor-user-id",
    "itemId": "nft_singularity"
  }'
```

**검증**:
- 에러 응답 반환 (`INSUFFICIENT_BALANCE`)
- DB에 변경사항이 없는지 확인

---

#### 4. 내 보유 아이템 조회

```bash
curl "http://localhost:3000/api/nfts/my?userId=test-user-id"
```

**검증**:
- 구매한 아이템이 목록에 표시되는지 확인
- 아이템 정보가 정확한지 확인

---

### 수동 검증

**SQLite DB 직접 확인**:

```bash
# Drizzle Studio 실행
npm run db:studio

# 또는 SQLite CLI
sqlite3 delta.db

# 상점 아이템 확인
SELECT * FROM shop_items;

# 유저 보유 아이템 확인
SELECT * FROM achievements WHERE user_id = 'test-user-id';

# 포인트 거래 기록 확인
SELECT * FROM point_transactions WHERE user_id = 'test-user-id';
```
