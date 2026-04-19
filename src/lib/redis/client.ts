import "server-only";

import Redis from "ioredis";
import { env } from "@/env";

type CacheValue = {
  value: string;
  expiresAt?: number;
};

let redisClient: Redis | null = null;
let redisAvailable = false; // tracks whether last known state was connected
const memoryStore = new Map<string, CacheValue>();

function getRedisClient(): Redis | null {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
      retryStrategy(times) {
        if (times > 10) {
          return null;
        }
        return Math.min(times * 500, 10_000);
      },
    });

    redisClient.on("error", (err: Error) => {
      // Only log the first failure per disconnection cycle to avoid log spam.
      if (redisAvailable) {
        console.warn("[redis] connection lost:", err.message);
        redisAvailable = false;
      }
    });

    redisClient.on("ready", () => {
      console.info("[redis] connection ready");
      redisAvailable = true;
    });

    redisClient.on("reconnecting", () => {
      // Intentionally silent — we already logged the error above.
    });
  }

  return redisClient;
}

async function ensureRedisConnection(client: Redis): Promise<boolean> {
  try {
    if (client.status === "wait") {
      await client.connect();
    }
    return client.status === "ready";
  } catch {
    return false;
  }
}

function purgeExpiredMemoryKey(key: string) {
  const entry = memoryStore.get(key);
  if (entry?.expiresAt && entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
  }
}

function getMemoryValue(key: string): string | null {
  purgeExpiredMemoryKey(key);
  return memoryStore.get(key)?.value ?? null;
}

function setMemoryValue(key: string, value: string, ttlSeconds?: number) {
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
  });
}

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client || !redisAvailable) {
    return getMemoryValue(key);
  }

  const connected = await ensureRedisConnection(client);
  if (!connected) {
    return getMemoryValue(key);
  }

  try {
    return await client.get(key);
  } catch {
    return getMemoryValue(key);
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const client = getRedisClient();
  if (!client || !redisAvailable) {
    setMemoryValue(key, value, ttlSeconds);
    return;
  }

  const connected = await ensureRedisConnection(client);
  if (!connected) {
    setMemoryValue(key, value, ttlSeconds);
    return;
  }

  try {
    if (ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
  } catch {
    setMemoryValue(key, value, ttlSeconds);
  }
}

export async function cacheIncrement(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const client = getRedisClient();
  if (!client || !redisAvailable) {
    const current = Number(getMemoryValue(key) ?? "0") + 1;
    setMemoryValue(key, String(current), ttlSeconds);
    return current;
  }

  const connected = await ensureRedisConnection(client);
  if (!connected) {
    const current = Number(getMemoryValue(key) ?? "0") + 1;
    setMemoryValue(key, String(current), ttlSeconds);
    return current;
  }

  try {
    const current = await client.incr(key);
    if (current === 1) {
      await client.expire(key, ttlSeconds);
    }
    return current;
  } catch {
    const current = Number(getMemoryValue(key) ?? "0") + 1;
    setMemoryValue(key, String(current), ttlSeconds);
    return current;
  }
}
