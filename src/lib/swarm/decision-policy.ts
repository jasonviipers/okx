import { applyExpectedValueGate } from "@/lib/swarm/expected-value";
import { applyDecisionHarness } from "@/lib/swarm/harness";
import { finalizeConsensusDecision } from "@/lib/swarm/rejection-utils";
import { validateConsensus } from "@/lib/swarm/validator";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { ConsensusResult, DecisionResult } from "@/types/swarm";

export async function applyDecisionPolicy(input: {
  consensus: DecisionResult | ConsensusResult;
  ctx: MarketContext;
  memorySummary: MemorySummary;
  afterExpectedValue?:
    | ((
        consensus: ConsensusResult,
      ) => Promise<ConsensusResult> | ConsensusResult)
    | undefined;
}): Promise<DecisionResult> {
  const baseConsensus: ConsensusResult = {
    ...input.consensus,
    votes: input.consensus.votes ?? [],
    weightedScores: input.consensus.weightedScores ?? {
      BUY: 0,
      SELL: 0,
      HOLD: 1,
    },
  };
  let nextConsensus = validateConsensus(baseConsensus, input.ctx);
  nextConsensus = applyExpectedValueGate(nextConsensus, input.ctx);

  if (input.afterExpectedValue) {
    nextConsensus = await input.afterExpectedValue(nextConsensus);
  }

  nextConsensus = applyDecisionHarness(
    nextConsensus,
    input.ctx,
    input.memorySummary,
  );
  nextConsensus = finalizeConsensusDecision(nextConsensus);

  return {
    ...input.consensus,
    ...nextConsensus,
    memory: input.memorySummary,
  } as DecisionResult;
}
