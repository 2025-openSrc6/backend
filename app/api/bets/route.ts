import { getDbFromContext } from "@/lib/db";
import { bets } from "@/db/schema";
import type { NewBet } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/bets?roundId=1
 * 라운드별 베팅 정보를 조회합니다
 *
 * @example
 * ```
 * GET /api/bets?roundId=1
 * Response: { success: true, data: Bet[] }
 * ```
 */
export async function GET(request: Request, context: any) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId");

    const db = getDbFromContext(context);

    let allBets;

    if (roundId) {
      allBets = await db
        .select()
        .from(bets)
        .where(eq(bets.roundId, parseInt(roundId)));
    } else {
      allBets = await db.select().from(bets);
    }

    return Response.json(
      {
        success: true,
        data: allBets,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to fetch bets:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bets
 * 새로운 베팅을 생성합니다
 *
 * @example
 * ```json
 * {
 *   "roundId": 1,
 *   "walletAddress": "0x...",
 *   "selection": "gold",
 *   "amount": 100.5,
 *   "txDigest": "0x..."
 * }
 * ```
 */
export async function POST(request: Request, context: any) {
  try {
    const body = await request.json() as Partial<NewBet>;

    const db = getDbFromContext(context);

    // 필수 필드 검증
    if (!body.roundId || !body.walletAddress || !body.selection || body.amount === undefined) {
      return Response.json(
        {
          success: false,
          error: "Missing required fields: roundId, walletAddress, selection, amount",
        },
        { status: 400 }
      );
    }

    // selection 값 검증
    if (!["gold", "btc"].includes(body.selection)) {
      return Response.json(
        {
          success: false,
          error: "Invalid selection. Must be 'gold' or 'btc'",
        },
        { status: 400 }
      );
    }

    const result = await db
      .insert(bets)
      .values({
        roundId: body.roundId,
        walletAddress: body.walletAddress,
        selection: body.selection,
        amount: body.amount,
        txDigest: body.txDigest || undefined,
      })
      .returning();

    return Response.json(
      {
        success: true,
        data: result[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create bet:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
