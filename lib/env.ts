import { z } from 'zod';

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid postgres connection string')
    .min(1, 'DATABASE_URL is required'),
  SUI_NETWORK: z.enum(['devnet', 'testnet', 'mainnet']).default('testnet').optional(),
  SUI_RPC_URL: z.string().url().optional(),
  SUI_PACKAGE_ID: z.string().optional(),
  SUI_CAP_OBJECT_ID: z.string().optional(),
});

const processEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  SUI_NETWORK: process.env.SUI_NETWORK,
  SUI_RPC_URL: process.env.SUI_RPC_URL,
  SUI_PACKAGE_ID: process.env.SUI_PACKAGE_ID,
  SUI_CAP_OBJECT_ID: process.env.SUI_CAP_OBJECT_ID,
};

export const env = serverSchema.parse(processEnv);
