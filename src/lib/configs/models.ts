import { z } from "zod";

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

export const ACTIVE_SWARM_MODELS = [
  "glm-5.1:cloud",
  "gemma4:31b-cloud",
  "qwen3.5:cloud",
  "kimi-k2.5:cloud",
  "deepseek-v3.2:cloud",
] as const satisfies readonly AIModel[];

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
