import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import {
  AI_MODE_CONFIGS,
  type AIMode,
  DEFAULT_AI_MODE,
} from "@/lib/configs/models";
import { resolveTradingMode } from "@/lib/configs/trading-modes";
import { getRealtimeMarketContext } from "@/lib/market-data/service";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { getCachedSwarmResult } from "@/lib/redis/swarm-cache";
import { autoExecuteConsensus } from "@/lib/swarm/autoExecute";
import { runSwarm } from "@/lib/swarm/orchestrator";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? "BTC-USDT";
    const timeframe = (searchParams.get("timeframe") as Timeframe) || "1H";
    const requestedMode =
      (searchParams.get("mode") as AIMode) || DEFAULT_AI_MODE;
    const tradingMode = resolveTradingMode(
      searchParams.get("tradingMode") ?? env.TRADING_MODE,
    );
    const modeConfig =
      AI_MODE_CONFIGS[requestedMode] ?? AI_MODE_CONFIGS[DEFAULT_AI_MODE];
    const consensus = await getCachedSwarmResult(
      symbol,
      timeframe,
      tradingMode,
    );

    if (consensus) {
      const execution =
        modeConfig.autoExecute && consensus.executionEligible
          ? await autoExecuteConsensus(consensus, origin)
          : undefined;
      if (execution) {
        console.log("[SwarmConsensus] Execution result:", execution);
      }

      return NextResponse.json({
        data: { consensus, cached: true, execution },
        sourceHealth: {
          consensus: makeSourceHealth("cache", { cached: true }),
        },
        timestamp: new Date().toISOString(),
      });
    }

    const ctx = await getRealtimeMarketContext(symbol, timeframe);
    const result = await runSwarm(ctx, { tradingMode });
    const execution =
      modeConfig.autoExecute && result.consensus.executionEligible
        ? await autoExecuteConsensus(result.consensus, origin)
        : undefined;
    if (execution) {
      console.log("[SwarmConsensus] Execution result:", execution);
    }

    return NextResponse.json({
      data: {
        consensus: result.consensus,
        cached: result.cached,
        execution,
        marketContext: result.marketContext,
        totalElapsedMs: result.totalElapsedMs,
      },
      sourceHealth: {
        consensus: makeSourceHealth("computed"),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
