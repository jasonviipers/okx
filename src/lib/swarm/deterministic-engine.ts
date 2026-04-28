import { env } from "@/env";
import {
  clampConfidenceForTradingMode,
  DEFAULT_TRADING_MODE,
  getModeAdjustedAgreementThreshold,
  getModeAdjustedConfidenceThreshold,
  getTradingModeConfig,
  resolveTradingMode,
  type TradingMode,
} from "@/lib/configs/trading-modes";
import { clamp, clamp01 } from "@/lib/math-utils";
import { parseNumber } from "@/lib/runtime-utils";
import {
  buildDecisionFeatures,
  buildFeatureSummary,
  type DecisionFeatureVector,
  deriveDecisionCadence,
} from "@/lib/swarm/decision-features";
import { classifyMarketRegime } from "@/lib/swarm/regime";
import { SWARM_THRESHOLDS } from "@/lib/swarm/thresholds";
import type { MarketContext } from "@/types/market";
import type { DecisionHarnessReport, MemorySummary } from "@/types/memory";
import type {
  AgentVote,
  DecisionResult,
  ExpectedValueReport,
  MetaSelectionReport,
  RejectionReason,
  StrategyEngine,
  StrategyEngineReport,
  TradeSignal,
} from "@/types/swarm";
import type { AccountOverview } from "@/types/trade";

type EngineScoreCard = {
  trend: number;
  breakout: number;
  meanReversion: number;
  microstructure: number;
};

type DiagnosticOverlay = {
  agreementBlend: number;
  confidenceAdjustment: number;
  vetoBlockReason?: RejectionReason;
};

type ExecutionThresholds = {
  minDirectionalEdge: number;
  minConfidence: number;
  minMarketQuality: number;
  minNetEdgeBps: number;
  microAccountEdgeRelaxed: boolean;
};

function clampSigned(value: number): number {
  return clamp(value, -1, 1);
}

function toSignal(score: number, threshold: number): TradeSignal {
  if (score >= threshold) {
    return "BUY";
  }
  if (score <= -threshold) {
    return "SELL";
  }
  return "HOLD";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function candleDirectionalBias(features: DecisionFeatureVector): number {
  const closeBias = features.closeLocation * 2 - 1;
  const wickBias = features.lowerWickRatio - features.upperWickRatio;
  const bodyDirection = features.return1 >= 0 ? 1 : -1;

  return clampSigned(
    bodyDirection * features.candleBodyRatio * 0.5 +
      closeBias * 0.3 +
      wickBias * 0.2,
  );
}

function volumeDirectionalBias(features: DecisionFeatureVector): number {
  const directionalReturn = features.return3 * 0.55 + features.return5 * 0.45;
  const volumeStrength = clamp((features.volumeExpansion - 1) / 1.2, -1, 1);

  return clampSigned(Math.sign(directionalReturn || 1) * volumeStrength);
}

function trendScore(features: DecisionFeatureVector): number {
  return clampSigned(
    (features.return3 * 0.3 +
      features.return5 * 0.45 +
      features.return10 * 0.25 +
      features.distanceFromMean * 0.15) /
      0.012,
  );
}

function breakoutScore(features: DecisionFeatureVector): number {
  return clampSigned(
    (features.breakoutDistance * (0.55 + features.compressionScore * 0.45) +
      features.return3 * 0.2 +
      volumeDirectionalBias(features) * 0.15) /
      0.01,
  );
}

function meanReversionScore(features: DecisionFeatureVector): number {
  const pullbackBias = -(
    features.distanceFromVwap * 0.65 +
    features.distanceFromMean * 0.35
  );

  return clampSigned(
    (pullbackBias + candleDirectionalBias(features) * 0.2) / 0.012,
  );
}

function microstructureScore(features: DecisionFeatureVector): number {
  return clampSigned(
    features.orderBookImbalance * 0.55 +
      features.topBookPressure * 0.3 +
      candleDirectionalBias(features) * 0.15,
  );
}

function selectedEngineForRegime(
  regime: DecisionResult["regime"],
): StrategyEngine {
  switch (regime?.regime) {
    case "trend":
      return "trend_continuation";
    case "breakout":
      return "breakout";
    case "mean_reversion":
      return "mean_reversion";
    case "stress":
    case "illiquid":
      return "microstructure";
    default:
      return "microstructure";
  }
}

function engineReasons(
  engine: StrategyEngine,
  features: DecisionFeatureVector,
): string[] {
  switch (engine) {
    case "trend_continuation":
      return [
        `Return stack favors continuation (${(features.return5 * 10_000).toFixed(1)} bps over 5 bars).`,
        `Distance from mean is ${formatPercent(features.distanceFromMean)}.`,
      ];
    case "breakout":
      return [
        `Compression score is ${(features.compressionScore * 100).toFixed(0)}%.`,
        `Breakout distance is ${(features.breakoutDistance * 10_000).toFixed(1)} bps.`,
      ];
    case "mean_reversion":
      return [
        `Distance from VWAP is ${(features.distanceFromVwap * 10_000).toFixed(1)} bps.`,
        `Wick balance is ${(features.lowerWickRatio - features.upperWickRatio).toFixed(2)}.`,
      ];
    case "microstructure":
      return [
        `Order-book imbalance is ${(features.orderBookImbalance * 100).toFixed(1)}%.`,
        `Top-book pressure is ${(features.topBookPressure * 100).toFixed(1)}%.`,
      ];
    default:
      return ["No deterministic engine reason available."];
  }
}

function buildEngineReports(
  features: DecisionFeatureVector,
  scoreCard: EngineScoreCard,
): StrategyEngineReport[] {
  const reports: Array<[StrategyEngine, number]> = [
    ["trend_continuation", scoreCard.trend],
    ["breakout", scoreCard.breakout],
    ["mean_reversion", scoreCard.meanReversion],
    ["microstructure", scoreCard.microstructure],
  ];

  return reports.map(([engine, score]) => ({
    engine,
    signal: toSignal(score, 0.08),
    confidence: Number(clamp01(Math.abs(score)).toFixed(3)),
    supportScore: Number(Math.abs(score).toFixed(3)),
    reasons: engineReasons(engine, features),
    supportingRoles: [],
  }));
}

function computeAgreement(
  signal: TradeSignal,
  engineReports: StrategyEngineReport[],
): number {
  const directionalReports = engineReports.filter(
    (report) => report.signal !== "HOLD",
  );

  if (signal === "HOLD") {
    const directionalSupport = directionalReports.reduce(
      (total, report) => total + report.supportScore,
      0,
    );
    return Number(clamp01(1 - directionalSupport / 2.5).toFixed(3));
  }

  const alignedSupport = directionalReports
    .filter((report) => report.signal === signal)
    .reduce((total, report) => total + report.supportScore, 0);
  const totalSupport = directionalReports.reduce(
    (total, report) => total + report.supportScore,
    0,
  );

  return Number(
    (totalSupport > 0 ? alignedSupport / totalSupport : 0.5).toFixed(3),
  );
}

function computeExecutionQualityScore(
  features: DecisionFeatureVector,
  directionalSignal: TradeSignal,
): number {
  const spreadQuality = clamp01(1 - features.spreadBps / 18);
  const slippageBps =
    directionalSignal === "SELL"
      ? features.sellSlippageBps
      : directionalSignal === "BUY"
        ? features.buySlippageBps
        : (features.buySlippageBps + features.sellSlippageBps) / 2;
  const slippageQuality = clamp01(1 - slippageBps / 20);
  const depthQuality = clamp01(
    features.totalBookDepthUsd /
      Math.max(features.assumedTradeNotionalUsd * 10, 1),
  );

  return Number(
    (
      spreadQuality * 0.45 +
      slippageQuality * 0.35 +
      depthQuality * 0.2
    ).toFixed(3),
  );
}

function computeRiskPenaltyScore(
  features: DecisionFeatureVector,
  directionalSignal: TradeSignal,
): number {
  const volatilityPenalty = clamp01(features.realizedVolatilityLong / 0.0125);
  const stretchPenalty = clamp01(
    Math.max(
      Math.abs(features.distanceFromVwap),
      Math.abs(features.distanceFromMean),
    ) / 0.015,
  );
  const indecisionPenalty = clamp01(
    features.candleBodyRatio < 0.12
      ? (0.12 - features.candleBodyRatio) / 0.12
      : 0,
  );
  const directionalWickPenalty =
    directionalSignal === "BUY"
      ? clamp01((features.upperWickRatio - features.lowerWickRatio + 0.2) / 0.8)
      : directionalSignal === "SELL"
        ? clamp01(
            (features.lowerWickRatio - features.upperWickRatio + 0.2) / 0.8,
          )
        : clamp01(Math.abs(features.upperWickRatio - features.lowerWickRatio));

  return Number(
    (
      volatilityPenalty * 0.45 +
      stretchPenalty * 0.25 +
      indecisionPenalty * 0.15 +
      directionalWickPenalty * 0.15
    ).toFixed(3),
  );
}

function expectedMoveBps(
  features: DecisionFeatureVector,
  selectedEngine: StrategyEngine,
): number {
  const baseMoveBps = Math.max(
    12,
    features.realizedVolatilityShort * 10_000 * 1.15,
  );
  const engineMultiplier =
    selectedEngine === "breakout"
      ? 1.1
      : selectedEngine === "trend_continuation"
        ? 0.95
        : selectedEngine === "mean_reversion"
          ? 0.8
          : 0.7;
  const volumeMultiplier = clamp(
    0.85 + features.volumeExpansion * 0.15,
    0.75,
    1.3,
  );

  return baseMoveBps * engineMultiplier * volumeMultiplier;
}

function buildWeightedScores(
  rawDirectionalEdge: number,
  marketQualityScore: number,
): Record<TradeSignal, number> {
  const directionalMagnitude = clamp01(Math.abs(rawDirectionalEdge));

  return {
    BUY: Number(
      (
        Math.max(0, rawDirectionalEdge) *
        (0.7 + marketQualityScore * 0.3)
      ).toFixed(3),
    ),
    SELL: Number(
      (
        Math.max(0, -rawDirectionalEdge) *
        (0.7 + marketQualityScore * 0.3)
      ).toFixed(3),
    ),
    HOLD: Number(
      clamp01(
        1 - directionalMagnitude + (1 - marketQualityScore) * 0.35,
      ).toFixed(3),
    ),
  };
}

function buildRiskFlags(
  features: DecisionFeatureVector,
  regime: DecisionResult["regime"],
  marketQualityScore: number,
  directionalSignal: TradeSignal,
): string[] {
  const flags: string[] = [];

  if (regime.regime === "stress") {
    flags.push("regime_stress");
  }
  if (regime.regime === "illiquid") {
    flags.push("regime_illiquid");
  }
  if (features.spreadBps > 12) {
    flags.push("wide_spread");
  }
  if (
    Math.max(features.buySlippageBps, features.sellSlippageBps) >
    features.spreadBps * 1.2
  ) {
    flags.push("slippage_elevated");
  }
  if (features.realizedVolatilityLong > 0.01) {
    flags.push("volatility_elevated");
  }
  if (features.topBookDepthUsd < features.assumedTradeNotionalUsd * 2) {
    flags.push("top_book_depth_thin");
  }
  if (features.candleBodyRatio < 0.1) {
    flags.push("candle_indecision");
  }
  if (
    directionalSignal === "BUY" &&
    features.maxExecutableBuyUsd < features.minimumTradeNotionalUsd
  ) {
    flags.push("buying_power_constrained");
  }
  if (
    directionalSignal === "SELL" &&
    features.maxExecutableSellUsd < features.minimumTradeNotionalUsd
  ) {
    flags.push("inventory_constrained");
  }
  if (marketQualityScore < SWARM_THRESHOLDS.DEFAULT_MIN_MARKET_QUALITY) {
    flags.push("market_quality_soft");
  }

  return flags;
}

function buildDiagnosticOverlay(
  votes: AgentVote[],
  directionalSignal: TradeSignal,
  tradingMode: TradingMode,
): DiagnosticOverlay {
  if (votes.length === 0 || directionalSignal === "HOLD") {
    return {
      agreementBlend: 0,
      confidenceAdjustment: 0,
    };
  }

  const config = getTradingModeConfig(tradingMode);
  const weightedVotes = votes.map((vote) => {
    return {
      ...vote,
      weightedConfidence: vote.confidence * vote.voteWeight,
    };
  });
  const scoringVotes = weightedVotes.filter((vote) => !vote.isVetoLayer);
  const directionalVotes =
    scoringVotes.length > 0 ? scoringVotes : weightedVotes;
  const totalWeightedConfidence = directionalVotes.reduce(
    (sum, vote) => sum + vote.weightedConfidence,
    0,
  );
  const alignedWeightedConfidence = directionalVotes
    .filter((vote) => vote.signal === directionalSignal)
    .reduce((sum, vote) => sum + vote.weightedConfidence, 0);
  const opposingWeightedConfidence = directionalVotes
    .filter(
      (vote) => vote.signal !== directionalSignal && vote.signal !== "HOLD",
    )
    .reduce((sum, vote) => sum + vote.weightedConfidence, 0);
  const holdWeightedConfidence = directionalVotes
    .filter((vote) => vote.signal === "HOLD")
    .reduce((sum, vote) => sum + vote.weightedConfidence, 0);
  const supportiveShare =
    totalWeightedConfidence > 0
      ? alignedWeightedConfidence / totalWeightedConfidence
      : 0.5;
  const dragShare =
    totalWeightedConfidence > 0
      ? (opposingWeightedConfidence + holdWeightedConfidence * 0.6) /
        totalWeightedConfidence
      : 0.5;
  const confidenceAdjustment = Number(
    (
      (supportiveShare - dragShare) *
      config.diagnosticConfidenceInfluence
    ).toFixed(3),
  );
  const voteAgreement =
    directionalVotes.length > 0
      ? directionalVotes.filter((vote) => vote.signal === directionalSignal)
          .length / directionalVotes.length
      : 0.5;
  const vetoHoldVote = weightedVotes
    .filter((vote) => vote.isVetoLayer && vote.signal === "HOLD")
    .sort((left, right) => right.confidence - left.confidence)[0];

  const vetoBlockReason =
    vetoHoldVote && vetoHoldVote.confidence >= config.vetoHoldThreshold
      ? {
          layer: "validator" as const,
          code: "mode_aware_veto_hold",
          summary: `Trading mode "${tradingMode}" honored a veto HOLD from ${vetoHoldVote.role}.`,
          detail: `Model ${vetoHoldVote.model} issued HOLD at ${(vetoHoldVote.confidence * 100).toFixed(2)}%, exceeding the ${(
            config.vetoHoldThreshold * 100
          ).toFixed(2)}% ${tradingMode} veto threshold.`,
          metrics: {
            tradingMode,
            vetoRole: vetoHoldVote.role,
            vetoConfidence: Number((vetoHoldVote.confidence * 100).toFixed(4)),
            vetoThreshold: Number((config.vetoHoldThreshold * 100).toFixed(4)),
          },
        }
      : undefined;

  return {
    agreementBlend: Number(
      (voteAgreement * config.diagnosticAgreementBlend).toFixed(3),
    ),
    confidenceAdjustment:
      vetoHoldVote && !vetoBlockReason
        ? Number((confidenceAdjustment - config.softVetoPenalty).toFixed(3))
        : confidenceAdjustment,
    vetoBlockReason,
  };
}

function getExecutionThresholds(input: {
  features: DecisionFeatureVector;
  directionalSignal: TradeSignal;
  marketQualityScore: number;
  expectedNetEdgeBps: number;
  rewardRiskRatio: number;
  tradingMode: TradingMode;
}): ExecutionThresholds {
  const minDirectionalEdge = parseNumber(
    env.MIN_DIRECTIONAL_EDGE_SCORE,
    SWARM_THRESHOLDS.DEFAULT_MIN_DIRECTIONAL_EDGE,
  );
  const minConfidence = getModeAdjustedConfidenceThreshold(
    parseNumber(
      env.MIN_CONFIDENCE_THRESHOLD,
      SWARM_THRESHOLDS.DEFAULT_MIN_CONFIDENCE * 100,
    ),
    input.tradingMode,
  );
  const minMarketQuality = parseNumber(
    env.MIN_MARKET_QUALITY_SCORE,
    SWARM_THRESHOLDS.DEFAULT_MIN_MARKET_QUALITY,
  );
  const configuredMinNetEdgeBps = parseNumber(
    env.MIN_NET_EDGE_BPS,
    SWARM_THRESHOLDS.DEFAULT_MIN_NET_EDGE_BPS,
  );
  const microAccountEdgeRelaxed =
    input.directionalSignal === "BUY" &&
    input.features.marketType === "spot" &&
    input.features.budgetRemainingUsd > 0 &&
    input.features.budgetRemainingUsd <= 50 &&
    input.features.maxExecutableBuyUsd >=
      input.features.minimumTradeNotionalUsd &&
    input.marketQualityScore >= 0.94 &&
    input.expectedNetEdgeBps > 0 &&
    input.rewardRiskRatio >= 1.05;

  return {
    minDirectionalEdge,
    minConfidence,
    minMarketQuality,
    minNetEdgeBps: microAccountEdgeRelaxed
      ? Math.min(configuredMinNetEdgeBps, 1)
      : configuredMinNetEdgeBps,
    microAccountEdgeRelaxed,
  };
}

function buildRejectionReasons(input: {
  features: DecisionFeatureVector;
  directionalSignal: TradeSignal;
  directionalEdgeAbs: number;
  confidence: number;
  marketQualityScore: number;
  expectedNetEdgeBps: number;
  rewardRiskRatio: number;
  riskFlags: string[];
  tradingMode: TradingMode;
}): RejectionReason[] {
  const thresholds = getExecutionThresholds(input);
  const rejections: RejectionReason[] = [];
  const diagnosticDirectionalThreshold = 0.06;

  if (input.directionalSignal === "HOLD") {
    rejections.push({
      layer: "expected_value",
      code: "no_executable_directional_edge",
      summary: "No executable directional edge was detected.",
      detail:
        "The deterministic engine kept the setup flat because the signed edge stayed inside the neutral band.",
      metrics: {
        directionalEdge: Number(input.directionalEdgeAbs.toFixed(4)),
        diagnosticDirectionalThreshold: Number(
          diagnosticDirectionalThreshold.toFixed(4),
        ),
      },
    });
  }

  if (input.directionalSignal === "BUY") {
    if (
      input.features.maxExecutableBuyUsd <
      input.features.minimumTradeNotionalUsd
    ) {
      rejections.push({
        layer: "execution",
        code: "buy_budget_or_balance_too_small",
        summary: "BUY is not executable with the available quote budget.",
        detail:
          "Quote buying power does not clear the minimum trade notional for this symbol.",
        metrics: {
          maxExecutableBuyUsd: Number(
            input.features.maxExecutableBuyUsd.toFixed(4),
          ),
          minimumTradeNotionalUsd: Number(
            input.features.minimumTradeNotionalUsd.toFixed(4),
          ),
        },
      });
    }
  }

  if (input.directionalSignal === "SELL") {
    if (
      input.features.maxExecutableSellUsd <
      input.features.minimumTradeNotionalUsd
    ) {
      const flatSpotAccount =
        input.features.marketType === "spot" &&
        input.features.availableBaseUsd <= 0;
      rejections.push({
        layer: "execution",
        code:
          input.features.marketType === "spot"
            ? flatSpotAccount
              ? "spot_shorting_not_available"
              : "sell_inventory_too_small"
            : "derivative_sell_capacity_too_small",
        summary:
          input.features.marketType === "spot"
            ? flatSpotAccount
              ? "Spot account is flat, so the bearish setup resolves to HOLD."
              : "SELL is not executable with the available spot inventory."
            : "SELL is not executable with the available futures or swap capacity.",
        detail:
          input.features.marketType === "spot"
            ? flatSpotAccount
              ? "The engine detected a bearish setup, but there is no base inventory available and spot mode cannot open a synthetic short."
              : "Base inventory does not clear the minimum trade notional for this symbol."
            : "The bearish setup did not clear the minimum executable contract size under the current derivatives buying power.",
        metrics: {
          maxExecutableSellUsd: Number(
            input.features.maxExecutableSellUsd.toFixed(4),
          ),
          availableBaseUsd: Number(input.features.availableBaseUsd.toFixed(4)),
          minimumTradeNotionalUsd: Number(
            input.features.minimumTradeNotionalUsd.toFixed(4),
          ),
          marketType: input.features.marketType,
        },
      });
    }
  }

  if (
    input.directionalSignal !== "HOLD" &&
    input.directionalEdgeAbs < thresholds.minDirectionalEdge
  ) {
    rejections.push({
      layer: "expected_value",
      code: "directional_edge_below_threshold",
      summary: "Directional edge is below the minimum executable threshold.",
      detail: `Directional edge ${input.directionalEdgeAbs.toFixed(3)} is below ${thresholds.minDirectionalEdge.toFixed(3)}.`,
      metrics: {
        directionalEdge: Number(input.directionalEdgeAbs.toFixed(4)),
        minDirectionalEdge: Number(thresholds.minDirectionalEdge.toFixed(4)),
      },
    });
  }

  if (input.confidence < thresholds.minConfidence) {
    rejections.push({
      layer: "validator",
      code: "deterministic_confidence_below_min",
      summary: "Deterministic confidence is below the minimum threshold.",
      detail: `Confidence ${(input.confidence * 100).toFixed(2)}% is below ${(thresholds.minConfidence * 100).toFixed(2)}%.`,
      metrics: {
        confidence: Number((input.confidence * 100).toFixed(4)),
        minConfidence: Number((thresholds.minConfidence * 100).toFixed(4)),
      },
    });
  }

  if (input.marketQualityScore < thresholds.minMarketQuality) {
    rejections.push({
      layer: "market_data",
      code: "market_quality_below_threshold",
      summary: "Market quality is below the minimum threshold.",
      detail: `Market quality ${(input.marketQualityScore * 100).toFixed(2)}% is below ${(thresholds.minMarketQuality * 100).toFixed(2)}%.`,
      metrics: {
        marketQualityScore: Number((input.marketQualityScore * 100).toFixed(4)),
        minMarketQuality: Number(
          (thresholds.minMarketQuality * 100).toFixed(4),
        ),
      },
    });
  }

  if (input.expectedNetEdgeBps < thresholds.minNetEdgeBps) {
    rejections.push({
      layer: "expected_value",
      code: "expected_net_edge_below_threshold",
      summary: "Expected net edge does not clear the minimum threshold.",
      detail: `Expected net edge ${input.expectedNetEdgeBps.toFixed(2)} bps is below ${thresholds.minNetEdgeBps.toFixed(2)} bps.`,
      metrics: {
        expectedNetEdgeBps: Number(input.expectedNetEdgeBps.toFixed(4)),
        minNetEdgeBps: Number(thresholds.minNetEdgeBps.toFixed(4)),
        rewardRiskRatio: Number(input.rewardRiskRatio.toFixed(4)),
        microAccountEdgeRelaxed: thresholds.microAccountEdgeRelaxed,
      },
    });
  }

  if (input.riskFlags.includes("regime_stress")) {
    rejections.push({
      layer: "meta_selector",
      code: "stress_regime_rejected",
      summary: "Stress regime suppressed the setup.",
      detail:
        "The deterministic engine rejected the trade because realized volatility exceeded the preferred envelope.",
    });
  }

  if (input.riskFlags.includes("regime_illiquid")) {
    rejections.push({
      layer: "meta_selector",
      code: "illiquid_regime_rejected",
      summary: "Illiquid regime suppressed the setup.",
      detail:
        "The deterministic engine rejected the trade because spread and depth quality were too poor.",
    });
  }

  return rejections;
}

export function buildDeterministicConsensus(input: {
  ctx: MarketContext;
  accountOverview: AccountOverview;
  votes?: AgentVote[];
  memorySummary?: MemorySummary;
  budgetRemainingUsd?: number;
  tradingMode?: TradingMode;
}): DecisionResult {
  const tradingMode = resolveTradingMode(
    input.tradingMode ?? env.TRADING_MODE ?? DEFAULT_TRADING_MODE,
  );
  const expectedFeeBps = parseNumber(
    env.EXPECTED_FEE_BPS,
    SWARM_THRESHOLDS.DEFAULT_EXPECTED_FEE_BPS,
  );
  const features = buildDecisionFeatures({
    ctx: input.ctx,
    accountOverview: input.accountOverview,
    budgetRemainingUsd: input.budgetRemainingUsd,
  });
  const regime = classifyMarketRegime(input.ctx);
  const scoreCard: EngineScoreCard = {
    trend: trendScore(features),
    breakout: breakoutScore(features),
    meanReversion: meanReversionScore(features),
    microstructure: microstructureScore(features),
  };
  const selectedEngine = selectedEngineForRegime(regime);
  const engineReports = buildEngineReports(features, scoreCard);
  const volumeBias = volumeDirectionalBias(features);
  const selectedEngineScore =
    selectedEngine === "trend_continuation"
      ? scoreCard.trend
      : selectedEngine === "breakout"
        ? scoreCard.breakout
        : selectedEngine === "mean_reversion"
          ? scoreCard.meanReversion
          : scoreCard.microstructure;
  const rawDirectionalEdge = clampSigned(
    selectedEngineScore * 0.5 +
      scoreCard.microstructure * 0.2 +
      scoreCard.trend * 0.15 +
      scoreCard.breakout * 0.1 +
      volumeBias * 0.05,
  );
  const directionalSignal = toSignal(rawDirectionalEdge, 0.06);
  const executionQualityScore = computeExecutionQualityScore(
    features,
    directionalSignal,
  );
  const riskPenaltyScore = computeRiskPenaltyScore(features, directionalSignal);
  const marketQualityScore = Number(
    (
      executionQualityScore * 0.65 +
      clamp01(1 - features.realizedVolatilityLong / 0.0125) * 0.2 +
      clamp01(1 - features.spreadBps / 20) * 0.15
    ).toFixed(3),
  );
  const adjustedDirectionalEdge = Number(
    (
      rawDirectionalEdge *
      executionQualityScore *
      (1 - riskPenaltyScore)
    ).toFixed(3),
  );
  const directionalEdgeAbs = Math.abs(adjustedDirectionalEdge);
  const expectedGrossEdgeBps =
    directionalSignal === "HOLD"
      ? 0
      : directionalEdgeAbs * expectedMoveBps(features, selectedEngine);
  const slippageBps =
    directionalSignal === "SELL"
      ? features.sellSlippageBps
      : directionalSignal === "BUY"
        ? features.buySlippageBps
        : Math.max(features.buySlippageBps, features.sellSlippageBps);
  const expectedNetEdgeBps = Number(
    (expectedGrossEdgeBps - expectedFeeBps - slippageBps).toFixed(2),
  );
  const rewardRiskRatio = Number(
    (
      expectedGrossEdgeBps / Math.max(expectedFeeBps + slippageBps, 0.0001)
    ).toFixed(2),
  );
  const diagnosticOverlay = buildDiagnosticOverlay(
    input.votes ?? [],
    directionalSignal,
    tradingMode,
  );
  const directionalConfidence = Number(
    clampConfidenceForTradingMode(
      0.28 +
        directionalEdgeAbs * 0.42 +
        executionQualityScore * 0.18 +
        regime.confidence * 0.12 +
        diagnosticOverlay.confidenceAdjustment,
      tradingMode,
    ).toFixed(3),
  );
  const baseDirectionalAgreement = computeAgreement(
    directionalSignal,
    engineReports,
  );
  const directionalAgreement = Number(
    clamp01(
      baseDirectionalAgreement *
        (1 - getTradingModeConfig(tradingMode).diagnosticAgreementBlend) +
        diagnosticOverlay.agreementBlend,
    ).toFixed(3),
  );
  const riskFlags = buildRiskFlags(
    features,
    regime,
    marketQualityScore,
    directionalSignal,
  );
  const rejectionReasons = buildRejectionReasons({
    features,
    directionalSignal,
    directionalEdgeAbs,
    confidence: directionalConfidence,
    marketQualityScore,
    expectedNetEdgeBps,
    rewardRiskRatio,
    riskFlags,
    tradingMode,
  });
  if (diagnosticOverlay.vetoBlockReason) {
    rejectionReasons.push(diagnosticOverlay.vetoBlockReason);
  }
  const decision = rejectionReasons.length === 0 ? directionalSignal : "HOLD";
  const confidence =
    decision === directionalSignal
      ? directionalConfidence
      : Number(
          Math.min(
            directionalConfidence,
            clampConfidenceForTradingMode(0.49, tradingMode),
          ).toFixed(3),
        );
  const agreement =
    decision === directionalSignal
      ? directionalAgreement
      : Number(
          Math.min(
            directionalAgreement,
            getModeAdjustedAgreementThreshold(0.52, tradingMode),
          ).toFixed(3),
        );
  const weightedScores = buildWeightedScores(
    adjustedDirectionalEdge,
    marketQualityScore,
  );
  const engineScores: Record<StrategyEngine, number> = {
    trend_continuation: Number(Math.abs(scoreCard.trend).toFixed(3)),
    breakout: Number(Math.abs(scoreCard.breakout).toFixed(3)),
    mean_reversion: Number(Math.abs(scoreCard.meanReversion).toFixed(3)),
    microstructure: Number(Math.abs(scoreCard.microstructure).toFixed(3)),
    none: 0,
  };
  const metaSelection: MetaSelectionReport = {
    selectedEngine,
    suitability: Number(Math.abs(selectedEngineScore).toFixed(3)),
    actionBias: directionalSignal,
    engineScores,
    notes: [
      `Deterministic engine selected ${selectedEngine} from regime ${regime.regime}.`,
      `Adjusted directional edge is ${adjustedDirectionalEdge.toFixed(3)}.`,
    ],
    generatedAt: new Date().toISOString(),
  };
  const expectedValue: ExpectedValueReport = {
    grossEdgeBps: Number(expectedGrossEdgeBps.toFixed(2)),
    estimatedFeeBps: Number(expectedFeeBps.toFixed(2)),
    estimatedSlippageBps: Number(slippageBps.toFixed(2)),
    netEdgeBps: expectedNetEdgeBps,
    rewardRiskRatio,
    tradeAllowed: rejectionReasons.length === 0 && directionalSignal !== "HOLD",
    notes: [
      `Execution quality ${(executionQualityScore * 100).toFixed(1)}%.`,
      `Risk penalty ${(riskPenaltyScore * 100).toFixed(1)}%.`,
    ],
    generatedAt: new Date().toISOString(),
  };
  const harness: DecisionHarnessReport = {
    generatedAt: new Date().toISOString(),
    marketQualityScore,
    liquidityScore: Number(clamp01(1 - features.spreadBps / 18).toFixed(3)),
    volatilityPenalty: Number(riskPenaltyScore.toFixed(3)),
    memoryAlignmentScore: 0,
    confidenceAdjustment: Number(
      (confidence - directionalConfidence).toFixed(3),
    ),
    blockedByHarness: rejectionReasons.length > 0,
    notes: [
      `Execution quality ${(executionQualityScore * 100).toFixed(1)}%.`,
      `Selected engine ${selectedEngine}.`,
    ],
  };
  const cadence = deriveDecisionCadence(
    input.ctx.timeframe,
    marketQualityScore,
    features.compressionScore,
    features.realizedVolatilityLong,
  );

  return {
    symbol: input.ctx.symbol,
    marketType: features.marketType,
    tradingMode,
    timeframe: input.ctx.timeframe,
    signal: directionalSignal,
    directionalSignal,
    directionalConfidence,
    directionalAgreement,
    decision,
    confidence,
    agreement,
    decisionSource: "deterministic",
    featureSummary: buildFeatureSummary(features),
    riskFlags,
    directionalEdgeScore: adjustedDirectionalEdge,
    executionQualityScore,
    riskPenaltyScore,
    expectedNetEdgeBps,
    marketQualityScore,
    decisionCadenceMs: cadence.decisionCadenceMs,
    symbolThrottleMs: cadence.symbolThrottleMs,
    votes: input.votes ?? [],
    weightedScores,
    validatedAt: new Date().toISOString(),
    blocked: rejectionReasons.length > 0,
    executionEligible: decision !== "HOLD" && rejectionReasons.length === 0,
    blockReason: rejectionReasons[0]?.summary,
    rejectionReasons,
    memory: input.memorySummary,
    harness,
    regime,
    engineReports,
    metaSelection,
    expectedValue,
  };
}
