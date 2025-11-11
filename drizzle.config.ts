import { config as loadEnv } from 'dotenv';
import type { Config } from 'drizzle-kit';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

export default {
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',  // D1은 SQLite 기반
  dbCredentials: {
    // For local development, use a SQLite file
    url: process.env.DATABASE_URL || 'file:./delta.db',
  },
  strict: true,
  verbose: true,
} satisfies Config;
