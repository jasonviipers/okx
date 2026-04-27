import { z } from "zod";
import type { ModelRole } from "@/lib/configs/models";

export const TRADING_MODES = [
  "conservative",
  "balanced",
  "aggressive",
  "scalp",
] as const;

export type TradingMode = (typeof TRADING_MODES)[number];
export const tradingModeSchema = z.enum(TRADING_MODES);

export interface TradingModeConfig {
  label: string;
  description: string;
  confidenceClamp: {
    min: number;
    max: number;
  };
  confidenceThresholdOffsetPct: number;
  agreementThresholdOffset: number;
  vetoHoldThreshold: number;
  softVetoPenalty: number;
  diagnosticConfidenceInfluence: number;
  diagnosticAgreementBlend: number;
  roleWeightMultipliers: Partial<Record<ModelRole, number>>;
}

export const TRADING_MODE_CONFIGS: Record<TradingMode, TradingModeConfig> = {
  conservative: {
    label: "Conservative",
    description:
      "Higher conviction, stronger vetoes, and more weight on capital preservation.",
    confidenceClamp: { min: 0.08, max: 0.92 },
    confidenceThresholdOffsetPct: 10,
    agreementThresholdOffset: 0.1,
    vetoHoldThreshold: 0.72,
    softVetoPenalty: 0.08,
    diagnosticConfidenceInfluence: 0.08,
    diagnosticAgreementBlend: 0.18,
    roleWeightMultipliers: {
      strategy: 0.95,
      signal_worker: 0.9,
      risk: 1.25,
      validator: 1.2,
      execution: 0.75,
      orchestrator: 1,
    },
  },
  balanced: {
    label: "Balanced",
    description:
      "Default posture with even weighting between opportunity and risk controls.",
    confidenceClamp: { min: 0.05, max: 0.95 },
    confidenceThresholdOffsetPct: 0,
    agreementThresholdOffset: 0,
    vetoHoldThreshold: 0.75,
    softVetoPenalty: 0.05,
    diagnosticConfidenceInfluence: 0.1,
    diagnosticAgreementBlend: 0.2,
    roleWeightMultipliers: {
      strategy: 1,
      signal_worker: 1,
      risk: 1,
      validator: 1,
      execution: 1,
      orchestrator: 1,
    },
  },
  aggressive: {
    label: "Aggressive",
    description:
      "Lower execution gates, looser vetoes, and wider confidence headroom for strong setups.",
    confidenceClamp: { min: 0.04, max: 0.985 },
    confidenceThresholdOffsetPct: -8,
    agreementThresholdOffset: -0.08,
    vetoHoldThreshold: 0.9,
    softVetoPenalty: 0.035,
    diagnosticConfidenceInfluence: 0.14,
    diagnosticAgreementBlend: 0.24,
    roleWeightMultipliers: {
      strategy: 1.15,
      signal_worker: 1.1,
      risk: 0.8,
      validator: 0.85,
      execution: 1,
      orchestrator: 1,
    },
  },
  scalp: {
    label: "Scalp",
    description:
      "Short-horizon bias with tight execution scrutiny and faster tactical weighting.",
    confidenceClamp: { min: 0.05, max: 0.97 },
    confidenceThresholdOffsetPct: 4,
    agreementThresholdOffset: -0.02,
    vetoHoldThreshold: 0.7,
    softVetoPenalty: 0.06,
    diagnosticConfidenceInfluence: 0.12,
    diagnosticAgreementBlend: 0.28,
    roleWeightMultipliers: {
      strategy: 0.9,
      signal_worker: 1.15,
      risk: 0.9,
      validator: 1.25,
      execution: 1.05,
      orchestrator: 1,
    },
  },
};

export const DEFAULT_TRADING_MODE: TradingMode = "balanced";

export function resolveTradingMode(
  value: string | null | undefined,
): TradingMode {
  return tradingModeSchema.safeParse(value).success
    ? (value as TradingMode)
    : DEFAULT_TRADING_MODE;
}

export function getTradingModeConfig(
  mode: TradingMode = DEFAULT_TRADING_MODE,
): TradingModeConfig {
  return TRADING_MODE_CONFIGS[mode];
}

export function clampConfidenceForTradingMode(
  value: number,
  mode: TradingMode = DEFAULT_TRADING_MODE,
): number {
  const config = getTradingModeConfig(mode);
  const rounded = Number(value.toFixed(3));
  return Math.max(
    config.confidenceClamp.min,
    Math.min(config.confidenceClamp.max, rounded),
  );
}

export function getModeAdjustedConfidenceThreshold(
  basePercent: number,
  mode: TradingMode = DEFAULT_TRADING_MODE,
): number {
  const config = getTradingModeConfig(mode);
  return Math.max(
    0.01,
    Math.min(0.99, (basePercent + config.confidenceThresholdOffsetPct) / 100),
  );
}

export function getModeAdjustedAgreementThreshold(
  baseAgreement: number,
  mode: TradingMode = DEFAULT_TRADING_MODE,
): number {
  const config = getTradingModeConfig(mode);
  return Math.max(
    0.35,
    Math.min(0.95, baseAgreement + config.agreementThresholdOffset),
  );
}

export function getRoleWeightMultiplier(
  role: ModelRole,
  mode: TradingMode = DEFAULT_TRADING_MODE,
): number {
  return getTradingModeConfig(mode).roleWeightMultipliers[role] ?? 1;
}
