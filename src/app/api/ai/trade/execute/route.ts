import { performance } from "node:perf_hooks";
import { type NextRequest, NextResponse } from "next/server";
import { AI_MODE_CONFIGS } from "@/lib/configs/models";
import { makeSourceHealth } from "@/lib/observability/source-health";
import {
  incrementCounter,
  observeHistogram,
  withTelemetrySpan,
} from "@/lib/observability/telemetry";
import { OkxRequestError } from "@/lib/okx/client";
import { tradeExecutionRequestSchema } from "@/lib/schemas/trade";
import {
  executeTradeRequest,
  TradeExecutionServiceError,
} from "@/lib/trade/execute";

export const dynamic = "force-dynamic";

function recordRequestOutcome(
  status: number,
  result: string,
  extra?: Record<string, string | number | boolean | null | undefined>,
) {
  incrementCounter(
    "trade_execute_requests_total",
    "Total /api/ai/trade/execute requests.",
    1,
    {
      status,
      result,
      ...extra,
    },
  );
}

export async function POST(req: NextRequest) {
  return withTelemetrySpan(
    {
      name: "api.trade_execute",
      source: "api.trade_execute",
    },
    async (span) => {
      const startedAt = performance.now();

      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          recordRequestOutcome(400, "invalid_json");
          return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
          );
        }

        const parsed = tradeExecutionRequestSchema.safeParse(body);
        if (!parsed.success) {
          recordRequestOutcome(400, "invalid_request", {
            issues: parsed.error.issues.length,
          });
          return NextResponse.json(
            {
              error: "Invalid trade execution payload.",
              issues: parsed.error.flatten(),
            },
            { status: 400 },
          );
        }

        const {
          signal,
          symbol,
          marketType,
          size,
          price,
          mode,
          confirmed,
          decisionSnapshot,
          executionContext,
        } = parsed.data;

        span.addAttributes({
          signal,
          symbol,
          marketType,
          size,
          mode,
          confirmed: confirmed ?? false,
        });

        const modeConfig = AI_MODE_CONFIGS[mode];
        if (!modeConfig) {
          recordRequestOutcome(400, "invalid_mode", { signal });
          return NextResponse.json(
            { error: `Invalid AI mode: ${mode}` },
            { status: 400 },
          );
        }

        if (!modeConfig.autoExecute && !confirmed) {
          recordRequestOutcome(403, "confirmation_required", {
            signal,
            mode,
          });
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
          recordRequestOutcome(400, "hold_rejected", { signal, mode });
          return NextResponse.json(
            {
              success: false,
              error: "Cannot execute HOLD signal",
              executedAt: new Date().toISOString(),
            },
            { status: 400 },
          );
        }

        const execution = await executeTradeRequest({
          signal,
          symbol,
          marketType,
          size,
          price,
          mode,
          confirmed,
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
              simulated: execution.simulated,
              accountMode: execution.accountMode,
            },
          },
        );
        recordRequestOutcome(200, "success", { signal, mode });

        return NextResponse.json({
          data: {
            success: true,
            order: execution.order,
            executedAt: new Date().toISOString(),
            simulated: execution.simulated,
            accountMode: execution.accountMode,
          },
          sourceHealth: {
            execution: makeSourceHealth("okx_private"),
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("[API] /api/trade/execute error:", error);
        recordRequestOutcome(
          error instanceof OkxRequestError
            ? 502
            : error instanceof TradeExecutionServiceError
              ? error.status
              : 500,
          "error",
        );

        if (error instanceof TradeExecutionServiceError) {
          return NextResponse.json(
            {
              success: false,
              error: error.message,
              executedAt: new Date().toISOString(),
            },
            { status: error.status },
          );
        }

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
