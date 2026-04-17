import { type NextRequest, NextResponse } from "next/server";
import { makeSourceHealth } from "@/lib/observability/source-health";
import {
  buildUnavailableAccountOverview,
  getAccountOverview,
} from "@/lib/okx/account";
import { OkxRequestError } from "@/lib/okx/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? undefined;

  try {
    const overview = await getAccountOverview(symbol);

    return NextResponse.json({
      data: { overview },
      sourceHealth: {
        account: makeSourceHealth("okx_private", {
          warning: overview.warning,
        }),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/trade/account error:", error);

    if (error instanceof OkxRequestError) {
      if (error.status === 429) {
        const warning =
          "OKX rate-limited the private account API. The UI will retry automatically, and cached snapshots will be reused when available.";
        return NextResponse.json({
          data: {
            overview: buildUnavailableAccountOverview(symbol, warning),
          },
          sourceHealth: {
            account: makeSourceHealth("okx_private", {
              warning,
            }),
          },
          timestamp: new Date().toISOString(),
          code: error.code,
          subCode: error.subCode,
          warning,
        });
      }

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
