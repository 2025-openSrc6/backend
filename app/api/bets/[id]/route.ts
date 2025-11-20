import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { registry } from '@/lib/registry';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const bet = await registry.betService.getBetById(id);

    return createSuccessResponse({ bet });
  } catch (error) {
    return handleApiError(error);
  }
}
