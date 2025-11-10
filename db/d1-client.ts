import { drizzle } from "drizzle-orm/d1";

export type Env = {
  DB: D1Database;
};

export function createDbClient(env: Env) {
  return drizzle(env.DB);
}

export type DbClient = ReturnType<typeof createDbClient>;
