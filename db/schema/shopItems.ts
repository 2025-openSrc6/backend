import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * shop_items 테이블
 * - 상점에서 판매하는 모든 아이템 (NFT, 닉네임, 컬러, 부스트 등)
 */
export const shopItems = sqliteTable(
    'shop_items',
    {
        /** PK: 아이템 ID (예: item_nickname, nft_obsidian) */
        id: text('id').primaryKey(),

        /** 카테고리: NICKNAME | COLOR | NFT | BOOST | ITEM */
        category: text('category', { length: 20 }).notNull(),

        /** 표시 이름 */
        name: text('name', { length: 100 }).notNull(),

        /** 설명 */
        description: text('description'),

        /** 가격 */
        price: integer('price', { mode: 'number' }).notNull(),

        /** 통화: DEL | CRYSTAL */
        currency: text('currency', { length: 10 }).notNull(),

        /** NFT 티어 (NFT인 경우): Obsidian, Aurum, Nova, Aetherion, Singularity */
        tier: text('tier', { length: 20 }),

        /** 메타데이터 (JSON string): 색상 코드, 효과 등 */
        metadata: text('metadata'),

        /** 이미지 URL */
        imageUrl: text('image_url'),

        /** 판매 가능 여부 */
        available: integer('available', { mode: 'boolean' }).notNull().default(true),

        /** 구매 전 닉네임 필요 여부 (델타 품목용) */
        requiresNickname: integer('requires_nickname', { mode: 'boolean' }).notNull().default(false),

        /** 생성 시각 */
        createdAt: integer('created_at', { mode: 'number' })
            .notNull()
            .$defaultFn(() => Date.now()),
    },
    (table) => ({
        categoryIdx: index('idx_shop_items_category').on(table.category),
        availableIdx: index('idx_shop_items_available').on(table.available),
    }),
);

export type ShopItem = typeof shopItems.$inferSelect;
export type NewShopItem = typeof shopItems.$inferInsert;
