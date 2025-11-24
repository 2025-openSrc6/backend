import { config as loadEnv } from 'dotenv';
import type { Config } from 'drizzle-kit';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for Drizzle config (use wrangler D1 binding or set an explicit file URL).',
  );
}

export default {
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite', // D1은 SQLite 기반
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
} satisfies Config;
