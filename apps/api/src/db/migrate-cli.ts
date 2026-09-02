import { databasePath, sqlite } from "./connection";

const versions = sqlite
  .query<{ version: number; name: string; appliedAt: string }, []>(
    "SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version"
  )
  .all();

console.log(`Database: ${databasePath}`);
for (const migration of versions) {
  console.log(`${migration.version}\t${migration.name}\t${migration.appliedAt}`);
}
