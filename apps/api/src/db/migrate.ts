import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type AppliedMigration = {
  version: number;
  name: string;
};

export function runMigrations(
  database: Database,
  migrationsDirectory = resolve(import.meta.dir, "migrations")
) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const alreadyApplied = new Set(
    database
      .query<{ version: number }, []>("SELECT version FROM schema_migrations")
      .all()
      .map((row) => row.version)
  );

  const files = readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));
  const applied: AppliedMigration[] = [];

  for (const file of files) {
    const version = Number(file.split("_", 1)[0]);
    if (alreadyApplied.has(version)) continue;

    const sql = readFileSync(resolve(migrationsDirectory, file), "utf8");
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(version, file, new Date().toISOString());
      database.exec("COMMIT;");
      applied.push({ version, name: file });
    } catch (error) {
      database.exec("ROLLBACK;");
      throw new Error(`Migration ${file} gagal`, { cause: error });
    }
  }

  return applied;
}
