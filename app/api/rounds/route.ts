import { getDbFromContext } from "@/lib/db";
import { rounds } from "@/db/schema";
import type { NewRound } from "@/db/schema";

/**
 * GET /api/rounds
 * 모든 라운드를 조회합니다
 *
 * @example
 * ```
 * GET /api/rounds
 * Response: { success: true, data: Round[] }
 * ```
 */
export async function GET(_request: Request, context: any) {
  try {
    const db = getDbFromContext(context);
    const allRounds = await db.select().from(rounds);

    return Response.json(
      {
        success: true,
        data: allRounds,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to fetch rounds:", error);
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
 * POST /api/rounds
 * 새로운 라운드를 생성합니다
 *
 * @example
 * ```json
 * {
 *   "roundKey": "round_001",
 *   "timeframe": "1h",
 *   "lockingStartsAt": 1731235200000,
 *   "lockingEndsAt": 1731238800000
 * }
 * ```
 */
export async function POST(request: Request, context: any) {
  try {
    const body = await request.json() as Partial<NewRound>;

    const db = getDbFromContext(context);

    // 필수 필드 검증
    if (!body.roundKey || !body.timeframe || !body.lockingStartsAt || !body.lockingEndsAt) {
      return Response.json(
        {
          success: false,
          error: "Missing required fields: roundKey, timeframe, lockingStartsAt, lockingEndsAt",
        },
        { status: 400 }
      );
    }

    const result = await db
      .insert(rounds)
      .values({
        roundKey: body.roundKey,
        timeframe: body.timeframe,
        status: body.status || "scheduled",
        lockingStartsAt: body.lockingStartsAt,
        lockingEndsAt: body.lockingEndsAt,
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
    console.error("Failed to create round:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
