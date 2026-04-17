import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const DEFAULT_DB_FILE = ".data/okx.sqlite";
const configuredDbFile = process.env.DB_FILE_NAME?.trim() || DEFAULT_DB_FILE;
const dbFilePath = path.isAbsolute(configuredDbFile)
  ? configuredDbFile
  : path.join(process.cwd(), configuredDbFile);

mkdirSync(path.dirname(dbFilePath), { recursive: true });

const client = createClient({
  url: pathToFileURL(dbFilePath).toString(),
});

const db = drizzle(client, { schema });

// Auto-migrate on startup — runs any pending migrations, no-ops if up to date
migrate(db, { migrationsFolder: "./src/db/migrations" }).catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

export default db;
export { dbFilePath };