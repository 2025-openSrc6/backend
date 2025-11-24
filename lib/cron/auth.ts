import { NextRequest, NextResponse } from 'next/server';
import { cronLogger } from './logger';

export async function verifyCronAuth(request: NextRequest): Promise<{
  success: boolean;
  response?: NextResponse;
}> {
  const secret = request.headers.get('X-Cron-Secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    cronLogger.error('CRON_SECRET not configured');
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Cron secret not configured' },
        },
        { status: 500 },
      ),
    };
  }

  if (secret !== expectedSecret) {
    cronLogger.warn('Invalid cron secret');
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } },
        { status: 401 },
      ),
    };
  }

  return { success: true };
}
