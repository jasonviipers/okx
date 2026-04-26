import "dotenv/config";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadVector, loadVss } from "sqlite-vss";
import { env } from "@/env";
import * as schema from "./schema";

const DEFAULT_DB_FILE = ".data/db.sqlite";
const DEFAULT_MIGRATIONS_DIR = "src/db/migrations";
const configuredMigrationsDir =
  env.DB_MIGRATIONS_DIR?.trim() || DEFAULT_MIGRATIONS_DIR;
const SUPPORTED_SQLITE_VSS_PLATFORMS = new Set([
  "darwin:arm64",
  "darwin:x64",
  "linux:x64",
]);
const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PRIVATE_BUILD_WORKER === "1";

function resolveLocalDatabaseFilePath() {
  const configuredDbFile = env.DB_FILE_NAME?.trim() || DEFAULT_DB_FILE;
  return path.isAbsolute(configuredDbFile)
    ? configuredDbFile
    : path.join(/* turbopackIgnore: true */ process.cwd(), configuredDbFile);
}

function resolveDatabasePath(): string {
  const configuredDatabaseUrl = env.DATABASE_URL?.trim();
  if (configuredDatabaseUrl) {
    if (configuredDatabaseUrl.startsWith("file:")) {
      return fileURLToPath(new URL(configuredDatabaseUrl));
    }

    if (
      URL_SCHEME_PATTERN.test(configuredDatabaseUrl) &&
      !WINDOWS_DRIVE_PATH_PATTERN.test(configuredDatabaseUrl)
    ) {
      const fallbackPath = resolveLocalDatabaseFilePath();
      console.warn(
        `Unsupported DATABASE_URL protocol for local SQLite runtime. Falling back to ${fallbackPath}.`,
      );
      return fallbackPath;
    }

    return path.isAbsolute(configuredDatabaseUrl)
      ? configuredDatabaseUrl
      : path.join(
          /* turbopackIgnore: true */ process.cwd(),
          configuredDatabaseUrl,
        );
  }

  return resolveLocalDatabaseFilePath();
}

function assertSqliteVssPlatformSupported() {
  const platformKey = `${platform}:${arch}`;
  if (!SUPPORTED_SQLITE_VSS_PLATFORMS.has(platformKey)) {
    throw new Error(
      `sqlite-vss is unsupported on ${platformKey}; use a linux-x64 or darwin host/container for vector search.`,
    );
  }
}

function loadSqliteVssExtensions(
  sqlite: InstanceType<typeof BetterSqlite3>,
): boolean {
  if (isBuildPhase) {
    return false;
  }

  try {
    assertSqliteVssPlatformSupported();
    loadVector(sqlite);
    loadVss(sqlite);
    return true;
  } catch (error) {
    console.warn(
      `sqlite-vss extension not available: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

function migrationRequiresVectorSearch(sql: string): boolean {
  return /\bvss0\b|swarm_memory_vss|sqlite-vss/i.test(sql);
}

function getMigrationsFolderForRuntime(vectorSearchEnabled: boolean): string {
  if (vectorSearchEnabled) {
    return migrationsFolder;
  }

  const migrationJournal = JSON.parse(
    readFileSync(migrationJournalPath, "utf8"),
  ) as {
    version: string;
    dialect: string;
    entries: Array<{
      idx: number;
      version: string;
      when: number;
      tag: string;
      breakpoints: boolean;
    }>;
  };

  const compatibleEntries = migrationJournal.entries.filter((entry) => {
    const migrationPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const migrationSql = readFileSync(migrationPath, "utf8");
    return !migrationRequiresVectorSearch(migrationSql);
  });
  const skippedCount =
    migrationJournal.entries.length - compatibleEntries.length;

  if (skippedCount > 0) {
    console.warn(
      `sqlite-vss unavailable; skipping ${skippedCount} vector migration${skippedCount === 1 ? "" : "s"} for this runtime.`,
    );
  }

  rmSync(fallbackMigrationsFolder, { recursive: true, force: true });
  mkdirSync(path.join(fallbackMigrationsFolder, "meta"), { recursive: true });

  for (const entry of compatibleEntries) {
    const sourcePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const targetPath = path.join(fallbackMigrationsFolder, `${entry.tag}.sql`);
    writeFileSync(targetPath, readFileSync(sourcePath, "utf8"), "utf8");
  }

  writeFileSync(
    path.join(fallbackMigrationsFolder, "meta", "_journal.json"),
    JSON.stringify(
      {
        ...migrationJournal,
        entries: compatibleEntries,
      },
      null,
      2,
    ),
    "utf8",
  );

  return fallbackMigrationsFolder;
}

const dbFilePath = isBuildPhase ? ":memory:" : resolveDatabasePath();
const migrationsFolder = path.isAbsolute(configuredMigrationsDir)
  ? configuredMigrationsDir
  : path.join(
      /* turbopackIgnore: true */ process.cwd(),
      configuredMigrationsDir,
    );
const migrationJournalPath = path.join(
  migrationsFolder,
  "meta",
  "_journal.json",
);
const fallbackMigrationsFolder = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".data",
  "_migrations-no-vss",
);

if (!isBuildPhase) {
  mkdirSync(path.dirname(dbFilePath), { recursive: true });
}

const sqlite = new BetterSqlite3(dbFilePath);
sqlite.pragma("foreign_keys = ON");
if (!isBuildPhase) {
  sqlite.pragma("journal_mode = WAL");
}
const vectorSearchEnabled = loadSqliteVssExtensions(sqlite);

const db = drizzle(sqlite, { schema });

if (!isBuildPhase) {
  if (!existsSync(migrationJournalPath)) {
    console.error(
      `Migration assets missing at ${migrationJournalPath}. Copy src/db/migrations into the runtime image or set DB_MIGRATIONS_DIR.`,
    );
    process.exit(1);
  }

  // Auto-migrate on startup. Runs any pending migrations and no-ops if up to date.
  try {
    migrate(db, {
      migrationsFolder: getMigrationsFolderForRuntime(vectorSearchEnabled),
    });
    if (vectorSearchEnabled) {
      sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS swarm_memory_vss USING vss0(
        embedding(1536)
      )`);
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

export default db;
export { dbFilePath, sqlite, vectorSearchEnabled };
