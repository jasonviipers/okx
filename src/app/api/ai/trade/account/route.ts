import { type NextRequest, NextResponse } from "next/server";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { getAccountOverview } from "@/lib/okx/account";
import { OkxRequestError } from "@/lib/okx/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? undefined;
    const overview = await getAccountOverview(symbol);

    return NextResponse.json({
      data: { overview },
      sourceHealth: {
        account: makeSourceHealth("okx_private"),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/trade/account error:", error);

    if (error instanceof OkxRequestError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          subCode: error.subCode,
          timestamp: new Date().toISOString(),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
