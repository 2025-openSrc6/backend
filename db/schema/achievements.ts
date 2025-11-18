import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * achievements 테이블
 * - NFT/뱃지/장식품 등 유저 보상 아이템 기록
 * - 온체인 NFT Object ID와 IPFS 메타데이터를 함께 저장하여 추적
 */
export const achievements = sqliteTable(
  'achievements',
  {
    /** PK: 업적/아이템 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 소유 유저 */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** 아이템 종류: NFT / BADGE / ACCESSORY */
    type: text('type', { length: 20 }).notNull(),

    /** 티어: A/B/C/D/E */
    tier: text('tier', { length: 5 }),

    /** 표시 이름 */
    name: text('name', { length: 100 }).notNull(),

    /** 설명 */
    description: text('description'),

    /** 구매가 (없으면 NULL) */
    purchasePrice: integer('purchase_price', { mode: 'number' }),

    /** 사용 통화 (DEL/CRYSTAL) */
    currency: text('currency', { length: 10 }),

    /** Sui NFT Object ID */
    suiNftObjectId: text('sui_nft_object_id', { length: 100 }),

    /** IPFS (Pinata) 메타데이터 URL */
    ipfsMetadataUrl: text('ipfs_metadata_url'),

    /** 이미지 URL (CDN) */
    imageUrl: text('image_url'),

    /** 기타 속성 (JSON string) */
    properties: text('properties'),

    /** 획득 시각 (Epoch milliseconds) */
    acquiredAt: integer('acquired_at', { mode: 'number' }).notNull(),

    /** 생성 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    userIdx: index('idx_achievements_user_id').on(table.userId),
    typeIdx: index('idx_achievements_type').on(table.type),
    tierIdx: index('idx_achievements_tier').on(table.tier),
  }),
);

export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
