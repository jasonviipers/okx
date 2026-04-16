import type {
  ConsensusResult,
  MarketRegime,
  MetaSelectionReport,
  StrategyEngine,
  TradeSignal,
} from "@/types/swarm";

const REGIME_ENGINE_PRIORITIES: Record<
  MarketRegime,
  Record<StrategyEngine, number>
> = {
  trend: {
    trend_continuation: 1,
    breakout: 0.7,
    mean_reversion: 0.2,
    microstructure: 0.55,
    none: 0,
  },
  breakout: {
    trend_continuation: 0.65,
    breakout: 1,
    mean_reversion: 0.15,
    microstructure: 0.7,
    none: 0,
  },
  mean_reversion: {
    trend_continuation: 0.25,
    breakout: 0.2,
    mean_reversion: 1,
    microstructure: 0.5,
    none: 0,
  },
  stress: {
    trend_continuation: 0.1,
    breakout: 0.1,
    mean_reversion: 0.2,
    microstructure: 0.15,
    none: 0,
  },
  illiquid: {
    trend_continuation: 0.05,
    breakout: 0.05,
    mean_reversion: 0.1,
    microstructure: 0.05,
    none: 0,
  },
};

const EMPTY_ENGINE_SCORES: Record<StrategyEngine, number> = {
  trend_continuation: 0,
  breakout: 0,
  mean_reversion: 0,
  microstructure: 0,
  none: 0,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function determineActionBias(consensus: ConsensusResult): TradeSignal {
  const { BUY, SELL, HOLD } = consensus.weightedScores;
  if (HOLD >= BUY && HOLD >= SELL) {
    return "HOLD";
  }
  return BUY >= SELL ? "BUY" : "SELL";
}

export function applyMetaSelection(
  consensus: ConsensusResult,
): ConsensusResult {
  const regime = consensus.regime;
  const engineReports = consensus.engineReports;
  if (!regime || !engineReports || engineReports.length === 0) {
    return consensus;
  }

  const engineScores = { ...EMPTY_ENGINE_SCORES };
  for (const report of engineReports) {
    const regimeWeight =
      REGIME_ENGINE_PRIORITIES[regime.regime][report.engine] ?? 0;
    engineScores[report.engine] += report.supportScore * regimeWeight;
  }

  const orderedEngines = Object.entries(engineScores).sort(
    (left, right) => right[1] - left[1],
  ) as Array<[StrategyEngine, number]>;
  const selectedEngine = orderedEngines[0]?.[0] ?? "none";
  const selectedEngineScore = orderedEngines[0]?.[1] ?? 0;
  const totalEngineScore = Object.values(engineScores).reduce(
    (sum, value) => sum + value,
    0,
  );
  const suitability =
    totalEngineScore > 0 ? selectedEngineScore / totalEngineScore : 0;
  const actionBias = determineActionBias(consensus);
  const notes: string[] = [];

  let nextSignal = consensus.signal;
  let nextConfidence = consensus.confidence;
  let blocked = consensus.blocked;
  let blockReason = consensus.blockReason;

  if (regime.regime === "stress" || regime.regime === "illiquid") {
    nextSignal = "HOLD";
    nextConfidence = Math.min(nextConfidence, 0.35);
    blocked = true;
    blockReason =
      blockReason ??
      `Meta-selector suppressed trading in ${regime.regime} regime conditions.`;
    notes.push("Trading disabled because the regime is hostile to execution.");
  } else if (regime.regime === "mean_reversion") {
    if (selectedEngine !== "microstructure") {
      nextConfidence = Math.max(0, nextConfidence - 0.12);
      notes.push(
        "Directional engines are down-weighted because the market looks rotational.",
      );
    } else {
      notes.push(
        "Microstructure carries more weight in rotational conditions.",
      );
    }
  } else if (suitability < 0.45 && consensus.signal !== "HOLD") {
    nextSignal = "HOLD";
    nextConfidence = Math.min(nextConfidence, 0.4);
    blocked = true;
    blockReason =
      blockReason ??
      "Meta-selector found weak alignment between the active regime and engine support.";
    notes.push(
      "No strategy engine has strong enough regime fit to justify a trade.",
    );
  } else if (
    (regime.regime === "trend" && selectedEngine === "trend_continuation") ||
    (regime.regime === "breakout" && selectedEngine === "breakout")
  ) {
    nextConfidence = clamp01(nextConfidence + 0.06);
    notes.push(
      "Consensus is aligned with the strongest regime-compatible engine.",
    );
  } else {
    notes.push(
      "Consensus remains valid, but regime alignment is only moderate.",
    );
  }

  const metaSelection: MetaSelectionReport = {
    selectedEngine,
    suitability: Number(suitability.toFixed(3)),
    actionBias: nextSignal === "HOLD" ? "HOLD" : actionBias,
    engineScores: Object.fromEntries(
      Object.entries(engineScores).map(([key, value]) => [
        key,
        Number(value.toFixed(3)),
      ]),
    ) as Record<StrategyEngine, number>,
    notes,
    generatedAt: new Date().toISOString(),
  };

  return {
    ...consensus,
    signal: nextSignal,
    decision: nextSignal,
    confidence: Number(nextConfidence.toFixed(3)),
    blocked,
    blockReason,
    metaSelection,
  };
}
