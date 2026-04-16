import "server-only";

import { createOllama } from "ai-sdk-ollama";

let ollamaProvider: ReturnType<typeof createOllama> | null = null;

export function isOllamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL);
}

export function getOllamaProvider() {
  if (!ollamaProvider) {
    ollamaProvider = createOllama({
      baseURL: process.env.OLLAMA_BASE_URL,
      apiKey: process.env.OLLAMA_API_KEY,
    });
  }

  return ollamaProvider;
}

export function getOllamaModel(modelId: string) {
  return getOllamaProvider()(modelId);
}
