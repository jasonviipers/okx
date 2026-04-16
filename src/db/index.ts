import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
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

export default db;
export { dbFilePath };
