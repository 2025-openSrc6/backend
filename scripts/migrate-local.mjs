import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'node:path';

async function main() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error(
      '[local-migrate] DATABASE_URL is required (e.g., file:./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/DB.sqlite)',
    );
  }

  const dbFile = dbUrl.replace(/^file:/, '');
  const sqlite = new Database(dbFile);
  const db = drizzle(sqlite);
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  await migrate(db, { migrationsFolder });
  console.log(`[local-migrate] Applied migrations to ${dbUrl}`);
}

main().catch((err) => {
  console.error('[local-migrate] Migration failed:', err);
  process.exit(1);
});
