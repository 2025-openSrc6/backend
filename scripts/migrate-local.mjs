import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'node:path';

async function main() {
  const dbFile = process.env.DATABASE_URL?.replace(/^file:/, '') || 'delta.db';
  const sqlite = new Database(dbFile);
  const db = drizzle(sqlite);
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  await migrate(db, { migrationsFolder });
  console.log(`[local-migrate] Applied migrations to ${dbFile}`);
}

main().catch((err) => {
  console.error('[local-migrate] Migration failed:', err);
  process.exit(1);
});
