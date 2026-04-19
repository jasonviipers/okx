import "server-only";

import Redis from "ioredis";

type CacheValue = {
  value: string;
  expiresAt?: number;
};

let redisClient: Redis | null = null;
const memoryStore = new Map<string, CacheValue>();

function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
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
        // Cap backoff at 10 seconds; give up after 10 consecutive failures.
        if (times > 10) {
          return null; // stop retrying — ioredis will emit "error" once and idle
        }
        return Math.min(times * 500, 10_000);
      },
    });

    // Required: without this listener Node.js throws an unhandled EventEmitter
    // error on every reconnect attempt, which is what you're seeing in the logs.
    redisClient.on("error", (err: Error) => {
      console.warn("[redis] connection error:", err.message);
    });

    redisClient.on("reconnecting", () => {
      console.info("[redis] reconnecting...");
    });

    redisClient.on("ready", () => {
      console.info("[redis] connection ready");
    });
  }

  return redisClient;
}

async function ensureRedisConnection(client: Redis): Promise<boolean> {
  try {
    if (client.status === "wait") {
      await client.connect();
    }
    return true;
  } catch (err) {
    console.warn(
      "[redis] could not establish connection, falling back to memory store:",
      err instanceof Error ? err.message : String(err),
    );
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
  return Boolean(process.env.REDIS_URL);
}

export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) {
    return getMemoryValue(key);
  }

  const connected = await ensureRedisConnection(client);
  if (!connected) {
    return getMemoryValue(key);
  }

  try {
    return await client.get(key);
  } catch (err) {
    console.warn("[redis] cacheGet failed, falling back to memory:", err instanceof Error ? err.message : String(err));
    return getMemoryValue(key);
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const client = getRedisClient();
  if (!client) {
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
  } catch (err) {
    console.warn("[redis] cacheSet failed, falling back to memory:", err instanceof Error ? err.message : String(err));
    setMemoryValue(key, value, ttlSeconds);
  }
}

export async function cacheIncrement(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const client = getRedisClient();
  if (!client) {
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
  } catch (err) {
    console.warn("[redis] cacheIncrement failed, falling back to memory:", err instanceof Error ? err.message : String(err));
    const current = Number(getMemoryValue(key) ?? "0") + 1;
    setMemoryValue(key, String(current), ttlSeconds);
    return current;
  }
}