import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import DatabaseConstructor from 'better-sqlite3';

const sqlite = new DatabaseConstructor('delta.db');
const db = drizzle(sqlite, { schema });

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
        imageUrl: 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=500&auto=format&fit=crop&q=60',
    },
    {
        id: 'item_color_single',
        category: 'COLOR',
        name: '닉네임 컬러 (단색)',
        description: '닉네임에 단색 컬러를 적용합니다.',
        price: 20000,
        currency: 'DEL',
        requiresNickname: true,
        imageUrl: 'https://images.unsplash.com/photo-1505909182942-e2f09aee3e89?w=500&auto=format&fit=crop&q=60',
    },
    {
        id: 'item_color_special',
        category: 'COLOR',
        name: '닉네임 컬러 (스페셜)',
        description: '2중/3중/무지개 컬러를 적용합니다.',
        price: 100000,
        currency: 'DEL',
        requiresNickname: true,
        imageUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=500&auto=format&fit=crop&q=60',
    },

    // --- NFT Tiers ---
    {
        id: 'nft_obsidian',
        category: 'NFT',
        name: 'Obsidian Tier NFT',
        tier: 'Obsidian',
        price: 300000,
        currency: 'DEL',
        imageUrl: 'https://images.unsplash.com/photo-1614730341194-75c607400070?w=500&auto=format&fit=crop&q=60',
    },
    {
        id: 'nft_aurum',
        category: 'NFT',
        name: 'Aurum Tier NFT',
        tier: 'Aurum',
        price: 500000,
        currency: 'DEL',
        imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60',
    },
    {
        id: 'nft_nova',
        category: 'NFT',
        name: 'Nova Tier NFT',
        tier: 'Nova',
        price: 1000000,
        currency: 'DEL',
        imageUrl: 'https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?w=500&auto=format&fit=crop&q=60',
    },
    {
        id: 'nft_aetherion',
        category: 'NFT',
        name: 'Aetherion Tier NFT',
        tier: 'Aetherion',
        price: 2000000,
        currency: 'DEL',
        imageUrl: 'https://images.unsplash.com/photo-1614728853913-1e22ba0e982b?w=500&auto=format&fit=crop&q=60',
    },
    {
        id: 'nft_singularity',
        category: 'NFT',
        name: 'Singularity Tier NFT',
        tier: 'Singularity',
        price: 100000000,
        currency: 'DEL',
        imageUrl: 'https://images.unsplash.com/photo-1535376472810-5d229c6bda3c?w=500&auto=format&fit=crop&q=60', // Star image
    },

    // --- 아이템 (Crystal) ---
    {
        id: 'item_boost_1day',
        category: 'BOOST',
        name: '부스트 토큰 (1일)',
        description: '1일간 베팅 성공 보상 +5%, 출석 포인트 +10%',
        price: 2,
        currency: 'CRYSTAL',
        imageUrl: 'https://images.unsplash.com/photo-1639815188546-c43c240ff4df?w=500&auto=format&fit=crop&q=60',
    },
    {
        id: 'item_green_mushroom',
        category: 'ITEM',
        name: 'Green Mushroom',
        description: '베팅 실패 시 투자 금액 50% 회수 (1회)',
        price: 2,
        currency: 'CRYSTAL',
        imageUrl: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=500&auto=format&fit=crop&q=60',
    },
];

async function main() {
    console.log('🌱 Seeding shop items...');

    for (const item of initialItems) {
        await db
            .insert(schema.shopItems)
            .values(item)
            .onConflictDoUpdate({
                target: schema.shopItems.id,
                set: item,
            });
    }

    console.log('✅ Shop items seeded successfully!');
}

main().catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
