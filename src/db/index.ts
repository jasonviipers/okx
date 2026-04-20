import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
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

function getSqliteVssExtensionSuffix() {
  if (platform === "darwin") {
    return "dylib";
  }

  if (platform === "win32") {
    return "dll";
  }

  return "so";
}

function getSqliteVssPlatformPackageName() {
  const operatingSystem = platform === "win32" ? "windows" : platform;
  return `sqlite-vss-${operatingSystem}-${arch}`;
}

function getNodeRequire() {
  if (typeof require === "function") {
    return require;
  }

  return createRequire(
    path.join(/* turbopackIgnore: true */ process.cwd(), "package.json"),
  );
}

function resolveNodeSpecifier(specifier: string, paths?: string[]) {
  const runtimeRequire = getNodeRequire();
  return paths?.length
    ? runtimeRequire.resolve(specifier, { paths })
    : runtimeRequire.resolve(specifier);
}

function getSqliteVssLoadablePath(name: "vector0" | "vss0") {
  const platformKey = `${platform}:${arch}`;
  if (!SUPPORTED_SQLITE_VSS_PLATFORMS.has(platformKey)) {
    throw new Error(
      `sqlite-vss is unsupported on ${platformKey}; use a linux-x64 or darwin host/container for vector search.`,
    );
  }

  const sqliteVssPackageJsonPath = resolveNodeSpecifier(
    "sqlite-vss/package.json",
  );

  return resolveNodeSpecifier(
    `${getSqliteVssPlatformPackageName()}/lib/${name}.${getSqliteVssExtensionSuffix()}`,
    [path.dirname(sqliteVssPackageJsonPath)],
  );
}

function loadSqliteVssExtensions(sqlite: InstanceType<typeof BetterSqlite3>) {
  if (isBuildPhase) {
    return;
  }

  try {
    sqlite.loadExtension(getSqliteVssLoadablePath("vector0"));
    sqlite.loadExtension(getSqliteVssLoadablePath("vss0"));
  } catch (error) {
    console.warn("sqlite-vss extension not available:", error);
  }
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

if (!isBuildPhase) {
  mkdirSync(path.dirname(dbFilePath), { recursive: true });
}

const sqlite = new BetterSqlite3(dbFilePath);
sqlite.pragma("foreign_keys = ON");
if (!isBuildPhase) {
  sqlite.pragma("journal_mode = WAL");
}
loadSqliteVssExtensions(sqlite);

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
    migrate(db, { migrationsFolder });
    sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS swarm_memory_vss USING vss0(
      embedding(1536)
    )`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

export default db;
export { dbFilePath, sqlite };
