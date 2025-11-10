import { config as loadEnv } from 'dotenv';
import type { Config } from 'drizzle-kit';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

export default {
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',  // D1은 SQLite 기반
  dbCredentials: {
    wranglerConfigPath: 'wrangler.toml',  // Wrangler 설정 파일
    dbName: 'deltax-db',  // wrangler.toml의 database_name
  },
  strict: true,
  verbose: true,
} satisfies Config;
