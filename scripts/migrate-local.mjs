import { execSync } from 'node:child_process';

function main() {
  const binding = process.env.D1_BINDING || 'DB';
  const cmd = `npx --yes wrangler d1 migrations apply ${binding} --local`;

  console.log(`[local-migrate] Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: process.env });
  console.log('[local-migrate] Done');
}

try {
  main();
} catch (err) {
  console.error('[local-migrate] Migration failed:', err);
  process.exit(1);
}
