import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function findLatestSql(drizzleDir) {
  const files = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'));
  if (files.length === 0) {
    throw new Error(`No .sql files found in ${drizzleDir}. Run "npm run db:generate" first.`);
  }
  files.sort(); // lexicographic sort works with 0000_, 0001_, ...
  return path.join(drizzleDir, files[files.length - 1]);
}

function main() {
  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const latest = findLatestSql(drizzleDir);
  const dbName = process.env.CF_D1_DB_NAME || 'my-db-name';

  console.log(`[remote-migrate] Applying latest migration: ${latest}`);
  const cmd = `npx --yes wrangler d1 execute ${dbName} --remote --file="${latest}"`;
  execSync(cmd, { stdio: 'inherit', env: process.env });
  console.log('[remote-migrate] Done');
}

try {
  main();
} catch (err) {
  console.error('[remote-migrate] Failed:', err);
  process.exit(1);
}
