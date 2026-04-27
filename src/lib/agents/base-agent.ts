import type { AgentRoleConfig } from "@/lib/configs/roles";
import {
  clampConfidenceForTradingMode,
  DEFAULT_TRADING_MODE,
  getRoleWeightMultiplier,
  type TradingMode,
} from "@/lib/configs/trading-modes";
import { buildBaseSystemPrompt } from "@/lib/prompts/base-system";
import { summarizeMarketContext } from "@/lib/prompts/market-context";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentResearchTrace, AgentVote, TradeSignal } from "@/types/swarm";

interface FinalizeVoteInput {
  model: string;
  roleConfig: AgentRoleConfig;
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
  startedAt: number;
  tradingMode?: TradingMode;
  researchTrace?: AgentResearchTrace;
}

export function buildAgentPrompt(
  ctx: MarketContext,
  roleConfig: AgentRoleConfig,
  researchContext?: string | null,
  memoryContext?: string | null,
): string {
  return [
    buildBaseSystemPrompt(ctx),
    summarizeMarketContext(ctx),
    researchContext?.trim() ? researchContext.trim() : null,
    memoryContext?.trim() ? memoryContext.trim() : null,
    roleConfig.systemPromptSuffix.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function summarizeMemoryForDisplay(
  summary?: MemorySummary | null,
): string | null {
  if (!summary || summary.totalMemories === 0) {
    return null;
  }

  return `Memory: ${summary.totalMemories} samples | dominant ${summary.dominantSignal} | blocked ${(summary.blockedRatio * 100).toFixed(0)}%`;
}

export function clampConfidence(
  value: number,
  tradingMode: TradingMode = DEFAULT_TRADING_MODE,
): number {
  return clampConfidenceForTradingMode(value, tradingMode);
}

export function finalizeVote(input: FinalizeVoteInput): AgentVote {
  const tradingMode = input.tradingMode ?? DEFAULT_TRADING_MODE;
  return {
    model: input.model,
    role: input.roleConfig.role,
    modelRole: input.roleConfig.modelRole,
    signal: input.signal,
    confidence: clampConfidence(input.confidence, tradingMode),
    reasoning: input.reasoning,
    elapsedMs: Math.max(1, Date.now() - input.startedAt),
    voteWeight:
      input.roleConfig.voteWeight *
      getRoleWeightMultiplier(input.roleConfig.modelRole, tradingMode),
    isVetoLayer: input.roleConfig.isVetoLayer,
    tradingMode,
    researchTrace: input.researchTrace,
  };
}
