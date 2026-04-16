import { z } from "zod";

// ---------------------------------------------------------------------------
// Model role tiers — strict enforcement in create-agent.ts and orchestrator.ts
//
//   strategy       Deep reasoning, sets the overall thesis (deepseek)
//   orchestrator   Coordinates & validates final signal (gpt-oss)
//   signal_worker  Market-facing analysts, generate votes (gemma4, kimi)
//   risk           Capital-preservation veto layer (ministral-3)
//   validator      Structural + execution veto gate (glm-5.1)
//   execution      Order routing ONLY — never allowed to reason (qwen3.5)
// ---------------------------------------------------------------------------
export type ModelRole =
  | "strategy"
  | "orchestrator"
  | "execution"
  | "signal_worker"
  | "risk"
  | "validator";

// ---------------------------------------------------------------------------
// Supported AI models
// ---------------------------------------------------------------------------
export const AI_MODELS = [
  "glm-5.1:cloud",
  "gemma4:31b-cloud",
  "qwen3.5:cloud",
  "kimi-k2.5:cloud",
  "deepseek-v3.2:cloud",
  "ministral-3:cloud",
  "gpt-oss:cloud",
] as const;

export type AIModel = (typeof AI_MODELS)[number];
export const aiModelSchema = z.enum(AI_MODELS);

// ---------------------------------------------------------------------------
// Model → Role map
// Every model has exactly one role; this is the source of truth for all
// permission checks throughout the swarm.
// ---------------------------------------------------------------------------
export const MODEL_ROLES: Record<AIModel, ModelRole> = {
  "deepseek-v3.2:cloud": "strategy",
  "gpt-oss:cloud": "orchestrator",
  "qwen3.5:cloud": "execution", // Order routing ONLY — never participates in reasoning
  "gemma4:31b-cloud": "signal_worker",
  "kimi-k2.5:cloud": "signal_worker",
  "glm-5.1:cloud": "validator",
  "ministral-3:cloud": "risk",
};

// ---------------------------------------------------------------------------
// Role capability flags — enforced at agent-creation time
// ---------------------------------------------------------------------------
export interface RoleCapabilities {
  /** May submit a BUY/SELL/HOLD vote into the swarm */
  canVote: boolean;
  /** May perform web research via Ollama web search */
  canUseWebSearch: boolean;
  /** Acts as a veto layer — HOLD overrides consensus */
  isVetoLayer: boolean;
  /** May ever receive a reasoning prompt (false = execution model) */
  canReason: boolean;
}

export const ROLE_CAPABILITIES: Record<ModelRole, RoleCapabilities> = {
  strategy: {
    canVote: true,
    canUseWebSearch: true,
    isVetoLayer: false,
    canReason: true,
  },
  orchestrator: {
    canVote: false, // Coordinates; does not vote
    canUseWebSearch: true,
    isVetoLayer: false,
    canReason: true,
  },
  signal_worker: {
    canVote: true,
    canUseWebSearch: true,
    isVetoLayer: false,
    canReason: true,
  },
  risk: {
    canVote: true,
    canUseWebSearch: false, // Risk uses only deterministic market data
    isVetoLayer: true,
    canReason: true,
  },
  validator: {
    canVote: true,
    canUseWebSearch: false, // Validator is purely structural
    isVetoLayer: true,
    canReason: true,
  },
  execution: {
    canVote: false, // NEVER allowed to reason or vote
    canUseWebSearch: false,
    isVetoLayer: false,
    canReason: false, // Hard gate — createAgent will throw if this model is used for analysis
  },
};

// ---------------------------------------------------------------------------
// Helper guards
// ---------------------------------------------------------------------------

/** Throws if the model's role forbids reasoning (execution tier). */
export function assertCanReason(modelId: AIModel): void {
  const role = MODEL_ROLES[modelId];
  const caps = ROLE_CAPABILITIES[role];
  if (!caps.canReason) {
    throw new Error(
      `Model "${modelId}" has role "${role}" and is not permitted to reason. ` +
        `It may only be used for order routing, never for analysis.`,
    );
  }
}

/** Returns true if this model may emit a swarm vote. */
export function modelCanVote(modelId: AIModel): boolean {
  const role = MODEL_ROLES[modelId];
  return ROLE_CAPABILITIES[role].canVote;
}

/** Returns true if this model may call Ollama web search. */
export function modelCanUseWebSearch(modelId: AIModel): boolean {
  const role = MODEL_ROLES[modelId];
  return ROLE_CAPABILITIES[role].canUseWebSearch;
}

/** Returns true if this model is a veto layer (risk or validator). */
export function modelIsVetoLayer(modelId: AIModel): boolean {
  const role = MODEL_ROLES[modelId];
  return ROLE_CAPABILITIES[role].isVetoLayer;
}

// ---------------------------------------------------------------------------
// Active swarm participants — only voting, non-execution models
// Execution (qwen3.5) and orchestrator (gpt-oss) are excluded from voting.
// ---------------------------------------------------------------------------
export const ACTIVE_SWARM_MODELS = [
  "deepseek-v3.2:cloud", // strategy
  "gemma4:31b-cloud", // signal_worker
  "kimi-k2.5:cloud", // signal_worker
  "glm-5.1:cloud", // validator (veto)
  "ministral-3:cloud", // risk (veto)
] as const satisfies readonly AIModel[];

export type ActiveSwarmModel = (typeof ACTIVE_SWARM_MODELS)[number];

// ---------------------------------------------------------------------------
// AI Modes
// ---------------------------------------------------------------------------
export const AI_MODES = [
  "ai_only",
  "ai_confirm",
  "ai_enhance",
  "ai_compare",
  "swarm",
] as const;

export type AIMode = (typeof AI_MODES)[number];
export const aiModeSchema = z.enum(AI_MODES).default("ai_enhance");

export interface AIModeConfig {
  label: string;
  description: string;
  autoExecute: boolean;
  requiresConfirmation: boolean;
}

export const AI_MODE_CONFIGS: Record<AIMode, AIModeConfig> = {
  ai_only: {
    label: "AI Only",
    description: "Swarm signal may auto-execute once thresholds pass.",
    autoExecute: true,
    requiresConfirmation: false,
  },
  ai_confirm: {
    label: "AI Confirm",
    description: "Swarm proposes the trade and a human confirms execution.",
    autoExecute: false,
    requiresConfirmation: true,
  },
  ai_enhance: {
    label: "AI Enhance",
    description: "Swarm enriches the workflow without auto-execution.",
    autoExecute: false,
    requiresConfirmation: true,
  },
  ai_compare: {
    label: "AI Compare",
    description: "Run models side-by-side without execution.",
    autoExecute: false,
    requiresConfirmation: false,
  },
  swarm: {
    label: "Swarm",
    description: "Full consensus and validation pipeline for analysis only.",
    autoExecute: false,
    requiresConfirmation: false,
  },
};

export const DEFAULT_AI_MODE: AIMode = "ai_enhance";
