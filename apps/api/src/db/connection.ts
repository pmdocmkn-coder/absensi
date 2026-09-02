import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

const defaultPath = resolve(import.meta.dir, "../../../../data/attendance.sqlite");
export const databasePath = Bun.env.SQLITE_PATH ?? defaultPath;
if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

export const sqlite = new Database(databasePath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

const appliedMigrations = runMigrations(sqlite);
for (const migration of appliedMigrations) {
  console.log(`[DB] migration ${migration.name} applied`);
}

export const db = drizzle(sqlite, { schema });
