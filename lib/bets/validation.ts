import { z } from 'zod';

/**
 * POST /api/bets Request Body 검증
 */
export const createBetSchema = z.object({
  roundId: z.string().uuid('Invalid UUID format'),
  prediction: z.enum(['GOLD', 'BTC'], {
    message: 'prediction must be one of: GOLD, BTC',
  }),
  amount: z
    .number()
    .int('Bet amount must be an integer')
    .min(100, 'Minimum bet amount is 100')
    .max(1000000, 'Maximum bet amount is 1,000,000'),
});

/**
 * GET /api/bets Query Parameters 검증
 */
export const getBetsQuerySchema = z.object({
  roundId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  prediction: z.enum(['GOLD', 'BTC']).optional(),
  resultStatus: z.string().optional(),
  settlementStatus: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'amount']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
