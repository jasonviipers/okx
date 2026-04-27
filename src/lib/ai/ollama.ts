import "server-only";

import { env } from "@/env";

const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";

type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
    thinking?: string;
  };
};

type OllamaChatOptions = {
  model: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  format?: "json";
  abortSignal?: AbortSignal;
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
}

export function getOllamaBaseUrl(): string {
  return env.OLLAMA_BASE_URL?.trim()
    ? normalizeBaseUrl(env.OLLAMA_BASE_URL)
    : OLLAMA_CLOUD_BASE_URL;
}

export function isOllamaConfigured(): boolean {
  return Boolean(env.OLLAMA_BASE_URL?.trim() || env.OLLAMA_API_KEY?.trim());
}

function getOllamaHeaders(): HeadersInit {
  const apiKey = env.OLLAMA_API_KEY?.trim();

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

export async function chatWithOllama(
  options: OllamaChatOptions,
): Promise<{ text: string; thinking?: string }> {
  const messages: OllamaMessage[] = [];
  if (options.system?.trim()) {
    messages.push({ role: "system", content: options.system.trim() });
  }
  messages.push({ role: "user", content: options.prompt });

  const generationOptions: Record<string, number> = {};
  if (options.temperature !== undefined) {
    generationOptions.temperature = options.temperature;
  }
  if (options.maxOutputTokens !== undefined) {
    generationOptions.num_predict = options.maxOutputTokens;
  }

  const response = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: getOllamaHeaders(),
    body: JSON.stringify({
      model: options.model,
      messages,
      stream: false,
      format: options.format,
      options:
        Object.keys(generationOptions).length > 0
          ? generationOptions
          : undefined,
    }),
    cache: "no-store",
    signal: options.abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Ollama chat failed with status ${response.status}`);
  }

  const payload = (await response.json()) as OllamaChatResponse;
  return {
    text: payload.message?.content?.trim() ?? "",
    thinking: payload.message?.thinking?.trim(),
  };
}
