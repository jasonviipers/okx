import "server-only";

import { env } from "@/env";
import { isGoogleSearchConfigured } from "@/lib/ai/google-search";
import { isOllamaConfigured } from "@/lib/ai/ollama";
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
import {
  getAccountOverview,
  hasBrokerAccountSnapshot,
} from "@/lib/okx/account";
import { isRedisConfigured } from "@/lib/redis/client";
import type { RuntimeStatus } from "@/types/api";

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  await ensureAutonomyBootState();
  const okxConfigured = hasOkxTradingCredentials();
  const redisConfigured = isRedisConfigured();
  const ollamaConfigured = isOllamaConfigured();
  const webResearchConfigured = isGoogleSearchConfigured();
  const accountOverview = okxConfigured
    ? await getAccountOverview().catch(() => undefined)
    : undefined;

  return {
    okx: {
      configured: okxConfigured,
      available: okxConfigured,
      detail: okxConfigured
        ? hasBrokerAccountSnapshot(accountOverview)
          ? "OKX private credentials configured with live account snapshot access"
          : "OKX private credentials configured"
        : "OKX private credentials missing",
      accountMode: getOkxAccountModeLabel(),
      baseUrl: OKX_CONFIG.baseUrl,
      accountOverview,
    },
    marketData: getMarketDataRuntimeStatus(),
    redis: {
      configured: redisConfigured,
      available: redisConfigured,
      detail: redisConfigured
        ? "Redis configured"
        : "Redis not configured, file-backed persistence active",
    },
    ollama: {
      configured: ollamaConfigured,
      available: ollamaConfigured,
      detail: ollamaConfigured
        ? "Ollama provider configured"
        : "Ollama provider not configured",
      baseUrl: env.OLLAMA_BASE_URL,
    },
    webResearch: {
      configured: webResearchConfigured,
      available: webResearchConfigured,
      detail: webResearchConfigured
        ? "Gemini Search enabled"
        : "Gemini Search disabled",
    },
    autonomy: await getAutonomyStatus(),
    timestamp: new Date().toISOString(),
  };
}
