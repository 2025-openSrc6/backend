import { z } from 'zod';

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid postgres connection string')
    .min(1, 'DATABASE_URL is required'),
});

const processEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
};

export const env = serverSchema.parse(processEnv);
