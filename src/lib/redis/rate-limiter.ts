import "server-only";

import { cacheIncrement } from "@/lib/redis/client";

export async function checkRateLimit(
  key: string,
  limit: number,
  ttlSeconds: number,
) {
  const count = await cacheIncrement(key, ttlSeconds);
  return {
    allowed: count <= limit,
    count,
  };
}
