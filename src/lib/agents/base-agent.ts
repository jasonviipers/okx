import type { AgentRoleConfig } from "@/lib/configs/roles";
import { buildBaseSystemPrompt } from "@/lib/prompts/base-system";
import { summarizeMarketContext } from "@/lib/prompts/market-context";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentVote, TradeSignal } from "@/types/swarm";

interface FinalizeVoteInput {
  model: string;
  roleConfig: AgentRoleConfig;
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
  startedAt: number;
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

export function clampConfidence(value: number): number {
  return Math.max(0.05, Math.min(0.95, Number(value.toFixed(3))));
}

export function finalizeVote(input: FinalizeVoteInput): AgentVote {
  return {
    model: input.model,
    role: input.roleConfig.role,
    modelRole: input.roleConfig.modelRole,
    signal: input.signal,
    confidence: clampConfidence(input.confidence),
    reasoning: input.reasoning,
    elapsedMs: Math.max(1, Date.now() - input.startedAt),
    voteWeight: input.roleConfig.voteWeight,
    isVetoLayer: input.roleConfig.isVetoLayer,
  };
}
