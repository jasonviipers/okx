import "server-only";

import type { GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import { embed } from "ai";
import {
  getGoogleEmbeddingModel,
  getGoogleEmbeddingModelId,
  isGoogleGenerativeAIConfigured,
} from "@/lib/ai/google";

export function getEmbeddingModelId(): string {
  return getGoogleEmbeddingModelId();
}

export async function generateEmbedding(
  value: string,
): Promise<number[] | null> {
  const normalizedValue = value.trim();
  if (!normalizedValue || !isGoogleGenerativeAIConfigured()) {
    return null;
  }

  const result = await embed({
    model: getGoogleEmbeddingModel(),
    value: normalizedValue,
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_DOCUMENT",
      } satisfies GoogleEmbeddingModelOptions,
    },
  });

  return result.embedding;
}
