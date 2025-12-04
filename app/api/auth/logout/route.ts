import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/shared/response';

/**
 * POST /api/auth/logout
 * 로그아웃 (쿠키 삭제)
 */
export async function POST(request: NextRequest) {
  try {
    const response = createSuccessResponse({ success: true });
    response.cookies.delete('suiAddress');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}