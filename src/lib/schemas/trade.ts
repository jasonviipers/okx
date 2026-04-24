import { z } from "zod";
import { aiModeSchema } from "@/lib/configs/models";

const tradeSignalSchema = z.enum(["BUY", "SELL", "HOLD"]);
const marketTypeSchema = z.enum(["spot", "futures", "swap"]);
const decisionSourceSchema = z.enum([
  "deterministic",
  "diagnostic",
  "diagnostic_swarm",
]);
const rejectionLayerSchema = z.enum([
  "validator",
  "meta_selector",
  "expected_value",
  "reliability",
  "harness",
  "market_data",
  "execution",
  "autonomy",
]);

const rejectionReasonSchema = z.object({
  layer: rejectionLayerSchema,
  code: z.string().min(1),
  summary: z.string().min(1),
  detail: z.string().optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
});

const tradeDecisionSnapshotSchema = z.object({
  signal: tradeSignalSchema,
  directionalSignal: tradeSignalSchema,
  decision: tradeSignalSchema,
  marketType: marketTypeSchema.optional(),
  confidence: z.number().finite(),
  agreement: z.number().finite(),
  executionEligible: z.boolean(),
  decisionSource: decisionSourceSchema.optional(),
  expectedNetEdgeBps: z.number().finite().optional(),
  marketQualityScore: z.number().finite().optional(),
  riskFlags: z.array(z.string()).optional(),
  featureSummary: z.record(z.string(), z.number().finite()).optional(),
  rejectionReasons: z.array(rejectionReasonSchema),
  validatedAt: z.string().min(1).optional(),
});

const tradeExecutionContextSchema = z.object({
  marketType: marketTypeSchema.optional(),
  referencePrice: z.number().finite().optional(),
  targetNotionalUsd: z.number().finite().optional(),
  normalizedSize: z.number().finite().optional(),
  expectedNetEdgeBps: z.number().finite().optional(),
  marketQualityScore: z.number().finite().optional(),
  tdMode: z.enum(["cash", "cross", "isolated"]).optional(),
  posSide: z.enum(["net", "long", "short"]).optional(),
  reduceOnly: z.boolean().optional(),
  stopLoss: z.number().finite().positive().nullable().optional(),
  takeProfitLevels: z.array(z.number().finite().positive()).max(3).optional(),
  trailingStopDistancePct: z.number().finite().positive().optional(),
  positionOrderId: z.string().min(1).optional(),
  exitReason: z
    .enum([
      "take_profit_1",
      "take_profit_2",
      "take_profit_3",
      "stop_loss",
      "trailing_stop",
    ])
    .optional(),
  exitTargetIndex: z.number().int().nonnegative().optional(),
  remainingSizeAfterExit: z.number().finite().nonnegative().optional(),
});

export const tradeExecutionRequestSchema = z.object({
  signal: tradeSignalSchema,
  symbol: z.string().min(1),
  marketType: marketTypeSchema.optional(),
  size: z.number().positive(),
  price: z.number().finite().positive().optional(),
  mode: aiModeSchema,
  confirmed: z.boolean().optional(),
  decisionSnapshot: tradeDecisionSnapshotSchema.optional(),
  executionContext: tradeExecutionContextSchema.optional(),
});
