import { NextResponse } from "next/server";
import {
  getOkxAccountModeLabel,
  getOkxPrivateAuthHint,
} from "@/lib/configs/okx";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { OkxRequestError } from "@/lib/okx/client";
import { getPositions } from "@/lib/okx/orders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const positions = await getPositions();

    return NextResponse.json({
      data: {
        positions,
        count: positions.length,
        accountMode: getOkxAccountModeLabel(),
      },
      sourceHealth: {
        positions: makeSourceHealth("okx_private"),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/trade/positions error:", error);

    if (error instanceof OkxRequestError) {
      const authError = error.status === 401 || error.status === 403;
      return NextResponse.json(
        {
          data: {
            positions: [],
            count: 0,
            accountMode: getOkxAccountModeLabel(),
          },
          sourceHealth: {
            positions: makeSourceHealth("okx_private", {
              warning: authError
                ? "OKX private positions request rejected"
                : error.message,
            }),
          },
          timestamp: new Date().toISOString(),
          code: error.code,
          subCode: error.subCode,
          warning: authError
            ? `OKX private positions request was rejected. ${getOkxPrivateAuthHint()}`
            : error.message,
        },
        { status: authError ? 200 : 502 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
