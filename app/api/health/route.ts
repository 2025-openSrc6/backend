import { getDbFromContext } from "@/lib/db";

/**
 * GET /api/health
 * DB 연결 상태를 확인합니다
 */
export async function GET(request: Request, context: any) {
  try {
    const db = getDbFromContext(context);

    // 간단한 쿼리로 DB 연결 테스트
    const result = await db.select().from(new String("rounds") as any).limit(1);

    return Response.json(
      {
        success: true,
        message: "Database connection successful",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json(
      {
        success: false,
        message: "Database connection failed",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
