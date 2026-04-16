import "server-only";

import type { SourceHealth } from "@/types/api";

export function makeSourceHealth(
  source: SourceHealth["source"],
  options?: {
    cached?: boolean;
    warning?: string;
    timestamp?: string;
  },
): SourceHealth {
  return {
    source,
    cached: options?.cached ?? false,
    timestamp: options?.timestamp ?? new Date().toISOString(),
    warning: options?.warning,
  };
}
