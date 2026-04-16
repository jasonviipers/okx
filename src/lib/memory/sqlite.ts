import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "swarm-memory.sqlite");

declare global {
  var __swarmMemoryDb: DatabaseSync | undefined;
}

function initDatabase(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      signal TEXT NOT NULL,
      confidence REAL NOT NULL,
      agreement REAL NOT NULL,
      blocked INTEGER NOT NULL,
      block_reason TEXT,
      price REAL NOT NULL,
      change24h REAL NOT NULL,
      spread_bps REAL NOT NULL,
      volatility_pct REAL NOT NULL,
      imbalance REAL NOT NULL,
      summary TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_swarm_memory_symbol_tf_created
      ON swarm_memory(symbol, timeframe, created_at DESC);
  `);
}

export function getMemoryDb(): DatabaseSync {
  if (!globalThis.__swarmMemoryDb) {
    mkdirSync(DATA_DIR, { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    initDatabase(db);
    globalThis.__swarmMemoryDb = db;
  }

  return globalThis.__swarmMemoryDb;
}

export function getMemoryDbPath(): string {
  return DB_PATH;
}
