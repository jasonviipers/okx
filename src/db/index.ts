import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const DEFAULT_DB_FILE = ".data/okx.sqlite";
const DEFAULT_MIGRATIONS_DIR = "src/db/migrations";
const configuredDbFile = process.env.DB_FILE_NAME?.trim() || DEFAULT_DB_FILE;
const configuredMigrationsDir =
  process.env.DB_MIGRATIONS_DIR?.trim() || DEFAULT_MIGRATIONS_DIR;

const dbFilePath = path.isAbsolute(configuredDbFile)
  ? configuredDbFile
  : path.join(process.cwd(), configuredDbFile);
const migrationsFolder = path.isAbsolute(configuredMigrationsDir)
  ? configuredMigrationsDir
  : path.join(process.cwd(), configuredMigrationsDir);
const migrationJournalPath = path.join(
  migrationsFolder,
  "meta",
  "_journal.json",
);

mkdirSync(path.dirname(dbFilePath), { recursive: true });

const client = createClient({
  url: pathToFileURL(dbFilePath).toString(),
});

const db = drizzle(client, { schema });

// Skip migrations during `next build`. The build spawns many parallel workers
// that all import this module at the same time, causing SQLITE_BUSY races.
// Migrations run at server startup instead (when only one process is active).
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!isBuildPhase) {
  if (!existsSync(migrationJournalPath)) {
    console.error(
      `Migration assets missing at ${migrationJournalPath}. Copy src/db/migrations into the runtime image or set DB_MIGRATIONS_DIR.`,
    );
    process.exit(1);
  }

  // Auto-migrate on startup. Runs any pending migrations and no-ops if up to date.
  migrate(db, { migrationsFolder }).catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

export default db;
export { dbFilePath };
