import "server-only";

import postgres, { type Sql } from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/env";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let client: Sql | null = null;
let db: Database | null = null;

function getDatabaseUrl(): string {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return databaseUrl;
}

function getConnectTimeoutSeconds(): number {
  const parsed = Number(env.PGCONNECT_TIMEOUT ?? "10");
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 10;
}

export function getDbClient(): Sql {
  if (!client) {
    client = postgres(getDatabaseUrl(), {
      connect_timeout: getConnectTimeoutSeconds(),
      max: 20,
      prepare: false,
    });
  }

  return client;
}

export function getDb(): Database {
  if (!db) {
    db = drizzle(getDbClient(), { schema });
  }

  return db;
}

export async function closeDb() {
  if (!client) {
    return;
  }

  const currentClient = client;
  client = null;
  db = null;
  await currentClient.end();
}
