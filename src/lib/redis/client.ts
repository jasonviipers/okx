import Redis from "ioredis";

const client = new Redis(process.env.REDIS_URL as string);

export async function cacheGet(key: string): Promise<string | null> {
  return client.get(key);
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
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
  const current = await client.incr(key);
  if (current === 1) {
    // Only set TTL on first increment to avoid resetting it on subsequent calls
    await client.expire(key, ttlSeconds);
  }
  return current;
}
