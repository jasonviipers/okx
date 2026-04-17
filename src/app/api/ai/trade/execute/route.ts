import { performance } from "node:perf_hooks";
import { type NextRequest, NextResponse } from "next/server";
import { AI_MODE_CONFIGS } from "@/lib/configs/models";
import {
  getOkxAccountModeLabel,
  hasOkxTradingCredentials,
} from "@/lib/configs/okx";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { OkxRequestError } from "@/lib/okx/client";
import { placeOrder } from "@/lib/okx/orders";
import { recordTradeExecution } from "@/lib/persistence/history";
import {
  incrementCounter,
  observeHistogram,
  withTelemetrySpan,
} from "@/lib/telemetry/server";
import type { TradeExecutionRequest } from "@/types/trade";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withTelemetrySpan(
    {
      name: "api.trade_execute",
      source: "api.trade_execute",
    },
    async (span) => {
      const startedAt = performance.now();

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

        span.addAttributes({
          signal,
          symbol,
          size,
          mode,
          confirmed: confirmed ?? false,
        });

        if (!signal || !symbol || !size || !mode) {
          incrementCounter(
            "trade_execute_requests_total",
            "Total /api/ai/trade/execute requests.",
            1,
            {
              status: 400,
              result: "invalid_request",
            },
          );
          return NextResponse.json(
            { error: "Missing required fields: signal, symbol, size, mode" },
            { status: 400 },
          );
        }

        const modeConfig = AI_MODE_CONFIGS[mode];
        if (!modeConfig) {
          incrementCounter(
            "trade_execute_requests_total",
            "Total /api/ai/trade/execute requests.",
            1,
            {
              status: 400,
              result: "invalid_mode",
            },
          );
          return NextResponse.json(
            { error: `Invalid AI mode: ${mode}` },
            { status: 400 },
          );
        }

        if (!modeConfig.autoExecute && !confirmed) {
          incrementCounter(
            "trade_execute_requests_total",
            "Total /api/ai/trade/execute requests.",
            1,
            {
              status: 403,
              result: "confirmation_required",
            },
          );
          return NextResponse.json(
            {
              success: false,
              error: `Mode '${mode}' requires human confirmation before execution.`,
              executedAt: new Date().toISOString(),
            },
            { status: 403 },
          );
        }

        if (signal === "HOLD") {
          incrementCounter(
            "trade_execute_requests_total",
            "Total /api/ai/trade/execute requests.",
            1,
            {
              status: 400,
              result: "hold_rejected",
            },
          );
          return NextResponse.json(
            {
              success: false,
              error: "Cannot execute HOLD signal",
              executedAt: new Date().toISOString(),
            },
            { status: 400 },
          );
        }

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

        const durationMs = Number((performance.now() - startedAt).toFixed(3));
        observeHistogram(
          "trade_execute_duration_ms",
          "Duration of /api/ai/trade/execute in milliseconds.",
          durationMs,
          {
            labels: {
              signal,
              simulated: !hasOkxTradingCredentials(),
              accountMode: getOkxAccountModeLabel(),
            },
          },
        );
        incrementCounter(
          "trade_execute_requests_total",
          "Total /api/ai/trade/execute requests.",
          1,
          {
            status: 200,
            result: "success",
            signal,
          },
        );

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
        incrementCounter(
          "trade_execute_requests_total",
          "Total /api/ai/trade/execute requests.",
          1,
          {
            status: error instanceof OkxRequestError ? 502 : 500,
            result: "error",
          },
        );

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
    },
  );
}
