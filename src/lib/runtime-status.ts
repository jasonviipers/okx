import "server-only";

import { env } from "@/env";
import { getOllamaBaseUrl, isOllamaConfigured } from "@/lib/ai/ollama";
import { isOllamaWebSearchConfigured } from "@/lib/ai/ollama-web";
import {
  ensureAutonomyBootState,
  getAutonomyStatus,
} from "@/lib/autonomy/service";
import {
  getOkxAccountModeLabel,
  hasOkxTradingCredentials,
  OKX_CONFIG,
} from "@/lib/configs/okx";
import { getMarketDataRuntimeStatus } from "@/lib/market-data/service";
import { isRedisConfigured } from "@/lib/redis/client";
import type { RuntimeStatus } from "@/types/api";

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  await ensureAutonomyBootState();
  const okxConfigured = hasOkxTradingCredentials();
  const redisConfigured = isRedisConfigured();
  const ollamaConfigured = isOllamaConfigured();
  const webResearchConfigured = isOllamaWebSearchConfigured();

  return {
    okx: {
      configured: okxConfigured,
      available: okxConfigured,
      detail: okxConfigured
        ? "OKX private credentials configured"
        : "OKX private credentials missing",
      accountMode: getOkxAccountModeLabel(),
      baseUrl: OKX_CONFIG.baseUrl,
    },
    marketData: getMarketDataRuntimeStatus(),
    redis: {
      configured: redisConfigured,
      available: redisConfigured,
      detail: redisConfigured
        ? "Redis configured"
        : "Redis not configured, in-memory fallback active",
    },
    ollama: {
      configured: ollamaConfigured,
      available: ollamaConfigured,
      detail: ollamaConfigured
        ? "Ollama provider configured"
        : "Ollama provider not configured",
      baseUrl: ollamaConfigured ? getOllamaBaseUrl() : env.OLLAMA_BASE_URL,
    },
    webResearch: {
      configured: webResearchConfigured,
      available: webResearchConfigured,
      detail: webResearchConfigured
        ? "web research enabled"
        : "web research disabled",
    },
    autonomy: await getAutonomyStatus(),
    timestamp: new Date().toISOString(),
  };
}
