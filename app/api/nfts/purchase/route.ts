import { getDb } from '@/lib/db';
import { shopItems, users, achievements, pointTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextContext } from '@/lib/types';
import { mintNFT } from '@/lib/sui/nft';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export const runtime = 'nodejs'; // Pinata 업로드 등 Node.js API 사용 필요

export async function POST(request: Request, context: NextContext) {
    console.log('🛒 POST /api/nfts/purchase called');
    try {
        const body = await request.json();
        console.log('📦 Request body:', body);
        const { userId, itemId } = body;
        const db = getDb();

        // 1. 아이템 정보 조회
        console.log('🔍 Looking up item:', itemId);
        const item = await db
            .select()
            .from(shopItems)
            .where(eq(shopItems.id, itemId))
            .limit(1);

        if (!item[0]) {
            console.error('❌ Item not found');
            return Response.json({ error: '아이템을 찾을 수 없습니다' }, { status: 404 });
        }
        console.log('✅ Item found:', item[0].name);

        if (!item[0].available) {
            return Response.json({ error: '판매 중지된 아이템입니다' }, { status: 400 });
        }

        // 2. 유저 정보 조회
        console.log('🔍 Looking up user:', userId);
        const user = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!user[0]) {
            console.error('❌ User not found');
            return Response.json({ error: '유저를 찾을 수 없습니다' }, { status: 404 });
        }
        console.log('✅ User found:', user[0].nickname);

        // 3. 잔액 확인
        const balance =
            item[0].currency === 'DEL' ? user[0].delBalance : user[0].crystalBalance;
        console.log('💰 Balance check:', balance, 'Required:', item[0].price);

        if (balance < item[0].price) {
            return Response.json(
                { error: 'INSUFFICIENT_BALANCE', message: '잔액이 부족합니다' },
                { status: 400 }
            );
        }

        // 4. 닉네임 필요 여부 확인
        if (item[0].requiresNickname && !user[0].nickname) {
            return Response.json(
                { error: 'NICKNAME_REQUIRED', message: '닉네임 설정이 필요합니다' },
                { status: 400 }
            );
        }

        // 5. 아이템별 효과 적용
        let nftObjectId: string | undefined;
        let ipfsMetadataUrl: string | undefined;
        const updates: Partial<typeof users.$inferSelect> = {};

        // 5-1. 닉네임 변경권
        if (item[0].category === 'NICKNAME') {
            const { newNickname } = body;
            if (!newNickname || typeof newNickname !== 'string' || newNickname.length < 2) {
                return Response.json(
                    { error: 'INVALID_NICKNAME', message: '유효한 새 닉네임이 필요합니다' },
                    { status: 400 }
                );
            }
            // 닉네임 중복 체크 (선택 사항, 여기서는 생략하거나 추가 가능)
            updates.nickname = newNickname;
        }

        // 5-2. 닉네임 컬러
        if (item[0].category === 'COLOR') {
            updates.nicknameColor = 'RAINBOW'; // 무지개색 고정 (추후 메타데이터 활용 가능)
        }

        // 5-3. 부스트 아이템
        if (item[0].category === 'BOOST') {
            const duration = 60 * 60 * 1000; // 1시간
            const currentBoost = user[0].boostUntil || Date.now();
            updates.boostUntil = Math.max(currentBoost, Date.now()) + duration;
        }

        // 5-4. 일반 아이템 (Green Mushroom)
        if (item[0].category === 'ITEM' && item[0].id.includes('mushroom')) {
            updates.greenMushrooms = (user[0].greenMushrooms || 0) + 1;
        }

        // 5-5. NFT 아이템
        if (item[0].category === 'NFT') {
            try {
                // Mock Minting 여부 확인
                const isMockMinting = process.env.MOCK_MINTING === 'true';

                // 5-5-1. 이미지 URL 준비 (DB에 저장된 CID 사용)
                // Sui Display Standard를 사용하므로 별도의 메타데이터 JSON 업로드 없이
                // 이미지 URL을 직접 NFT 객체에 저장합니다.
                const imageUrl = item[0].imageUrl
                    ? (item[0].imageUrl.startsWith('ipfs://') ? item[0].imageUrl : `ipfs://${item[0].imageUrl}`)
                    : `ipfs://QmPlaceholder${item[0].tier}`;

                // DB 저장을 위해 변수 할당 (메타데이터 URL 대신 이미지 URL 저장)
                ipfsMetadataUrl = imageUrl;

                if (isMockMinting) {
                    console.log('🧪 Mock Minting Enabled');
                    nftObjectId = `mock_nft_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                } else {
                    // 실제 민팅 로직 (Sui)
                    const adminKeypair = Ed25519Keypair.fromSecretKey(
                        Buffer.from(process.env.ADMIN_SECRET_KEY!, 'base64')
                    );

                    const { nftObjectId: mintedNftId } = await mintNFT({
                        userAddress: user[0].suiAddress,
                        metadataUrl: imageUrl, // 메타데이터 JSON 대신 이미지 URL 전달
                        tier: item[0].tier!,
                        name: item[0].name,
                        description: item[0].description || `${item[0].tier} Tier NFT`,
                        adminKeypair,
                    });

                    nftObjectId = mintedNftId;
                }
            } catch (error) {
                console.error('NFT Minting Error:', error);
                return Response.json(
                    { error: 'NFT_MINTING_FAILED', message: 'NFT 민팅에 실패했습니다' },
                    { status: 500 }
                );
            }
        }

        // 6. 트랜잭션 실행 (DB 업데이트)
        let newBalance = balance;

        // 잔액 차감
        if (item[0].currency === 'DEL') {
            newBalance = user[0].delBalance - item[0].price;
            updates.delBalance = newBalance;
        } else {
            newBalance = user[0].crystalBalance - item[0].price;
            updates.crystalBalance = newBalance;
        }

        // 통합 업데이트 실행
        await db
            .update(users)
            .set(updates)
            .where(eq(users.id, userId));

        // 포인트 거래 기록
        await db.insert(pointTransactions).values({
            userId,
            type: 'NFT_PURCHASE',
            currency: item[0].currency,
            amount: -item[0].price,
            balanceBefore: balance,
            balanceAfter: newBalance,
            referenceId: item[0].id,
            referenceType: 'SHOP_ITEM',
            description: `${item[0].name} 구매`,
        });

        // 아이템 지급 (Achievements)
        await db.insert(achievements).values({
            userId,
            type: item[0].category,
            tier: item[0].tier,
            name: item[0].name,
            purchasePrice: item[0].price,
            currency: item[0].currency,
            suiNftObjectId: nftObjectId,
            ipfsMetadataUrl,
            acquiredAt: Date.now(),
        });

        return Response.json({
            success: true,
            data: {
                item: item[0],
                nftObjectId,
                ipfsMetadataUrl,
                newBalance,
            },
        });
    } catch (error) {
        console.error('구매 처리 실패:', error);
        return Response.json(
            { error: 'PURCHASE_FAILED', message: '구매 처리에 실패했습니다' },
            { status: 500 }
        );
    }
}
