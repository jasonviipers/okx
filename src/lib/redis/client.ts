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
    });
  }

  return redisClient;
}

async function ensureRedisConnection(client: Redis) {
  if (client.status === "wait") {
    await client.connect();
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

  await ensureRedisConnection(client);
  return client.get(key);
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

  await ensureRedisConnection(client);
  if (ttlSeconds) {
    await client.set(key, value, "EX", ttlSeconds);
  } else {
    await client.set(key, value);
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

  await ensureRedisConnection(client);
  const current = await client.incr(key);
  if (current === 1) {
    await client.expire(key, ttlSeconds);
  }
  return current;
}
