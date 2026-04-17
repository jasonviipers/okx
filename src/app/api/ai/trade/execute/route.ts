import { type NextRequest, NextResponse } from "next/server";
import { AI_MODE_CONFIGS } from "@/lib/configs/models";
import {
  getOkxAccountModeLabel,
  hasOkxTradingCredentials,
} from "@/lib/configs/okx";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { recordTradeExecution } from "@/lib/persistence/history";
import { OkxRequestError } from "@/lib/okx/client";
import { placeOrder } from "@/lib/okx/orders";
import type { TradeExecutionRequest } from "@/types/trade";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body: TradeExecutionRequest = await req.json();
    const {
      signal,
      symbol,
      size,
      price,
      mode,
      confirmed,
      decisionSnapshot,
      executionContext,
    } = body;

    if (!signal || !symbol || !size || !mode) {
      return NextResponse.json(
        { error: "Missing required fields: signal, symbol, size, mode" },
        { status: 400 },
      );
    }

    const modeConfig = AI_MODE_CONFIGS[mode];
    if (!modeConfig) {
      return NextResponse.json(
        { error: `Invalid AI mode: ${mode}` },
        { status: 400 },
      );
    }

    // Block execution if mode doesn't allow auto-execution
    if (!modeConfig.autoExecute && !confirmed) {
      return NextResponse.json(
        {
          success: false,
          error: `Mode '${mode}' requires human confirmation before execution.`,
          executedAt: new Date().toISOString(),
        },
        { status: 403 },
      );
    }

    // Only execute BUY or SELL signals
    if (signal === "HOLD") {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot execute HOLD signal",
          executedAt: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    // Place the order
    const order = await placeOrder({
      symbol,
      side: signal === "BUY" ? "buy" : "sell",
      type: price ? "limit" : "market",
      size,
      price,
    });
    await recordTradeExecution(order, {
      decisionSnapshot,
      executionContext,
    });

    return NextResponse.json({
      data: {
        success: true,
        order,
        executedAt: new Date().toISOString(),
        simulated: !hasOkxTradingCredentials(),
        accountMode: getOkxAccountModeLabel(),
      },
      sourceHealth: {
        execution: makeSourceHealth("okx_private"),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/trade/execute error:", error);

    if (error instanceof OkxRequestError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          subCode: error.subCode,
          executedAt: new Date().toISOString(),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
