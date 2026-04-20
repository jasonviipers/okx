import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/env";

const DEFAULT_GOOGLE_EMBEDDING_MODEL = "gemini-embedding-001";
const DEFAULT_GOOGLE_SEARCH_MODEL = "gemini-2.5-flash";

let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

export function isGoogleGenerativeAIConfigured(): boolean {
  return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function getGoogleProvider() {
  if (!googleProvider) {
    googleProvider = createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }

  return googleProvider;
}

export function getGoogleEmbeddingModelId(): string {
  return env.GOOGLE_EMBEDDING_MODEL ?? DEFAULT_GOOGLE_EMBEDDING_MODEL;
}

export function getGoogleSearchModelId(): string {
  return env.GOOGLE_SEARCH_MODEL ?? DEFAULT_GOOGLE_SEARCH_MODEL;
}

export function getGoogleEmbeddingModel() {
  return getGoogleProvider().embedding(getGoogleEmbeddingModelId());
}

export function getGoogleSearchModel() {
  return getGoogleProvider()(getGoogleSearchModelId());
}
