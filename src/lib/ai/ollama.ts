import "server-only";

import { createOllama } from "ai-sdk-ollama";
import { env } from "@/env";

let ollamaProvider: ReturnType<typeof createOllama> | null = null;

export function isOllamaConfigured(): boolean {
  return Boolean(env.OLLAMA_BASE_URL);
}

export function getOllamaProvider() {
  if (!ollamaProvider) {
    ollamaProvider = createOllama({
      baseURL: env.OLLAMA_BASE_URL,
      apiKey: env.OLLAMA_API_KEY,
    });
  }

  return ollamaProvider;
}

export function getOllamaModel(modelId: string) {
  return getOllamaProvider()(modelId);
}
