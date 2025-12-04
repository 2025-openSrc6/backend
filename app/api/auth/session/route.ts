import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/shared/response';

/**
 * GET /api/auth/session
 * 현재 세션 정보 조회 (쿠키에서 suiAddress 읽어서 유저 정보 반환)
 */
export async function GET(request: NextRequest) {
  try {
    const suiAddress = request.cookies.get('suiAddress')?.value;

    if (!suiAddress) {
      return createSuccessResponse({ user: null });
    }

    const user = await registry.userRepository.findBySuiAddress(suiAddress);

    if (!user) {
      return createSuccessResponse({ user: null });
    }

    return createSuccessResponse({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/auth/session
 * 지갑 연결 및 세션 생성
 */
export async function POST(request: NextRequest) {
  try {
    const { suiAddress } = await request.json();

    if (!suiAddress || typeof suiAddress !== 'string') {
      return createErrorResponse(400, 'INVALID_INPUT', 'suiAddress is required');
    }

    // 1. 유저 조회 또는 생성
    const user = await registry.userService.findOrCreateUser(suiAddress);

    // 2. 쿠키에 suiAddress 저장
    const response = createSuccessResponse({ user });
    response.cookies.set('suiAddress', suiAddress, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7일
      path: '/',
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
