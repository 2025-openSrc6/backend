import { NextRequest } from 'next/server';
import { registry } from '@/lib/registry';
import { UnauthorizedError } from '@/lib/shared/errors';

export interface SessionData {
  userId: string;
  suiAddress: string;
}

export async function requireAuth(request: NextRequest): Promise<SessionData> {
  const suiAddress = request.cookies.get('suiAddress')?.value;

  if (!suiAddress) {
    throw new UnauthorizedError('Login required');
  }

  // users 테이블에서 조회
  const user = await registry.userRepository.findBySuiAddress(suiAddress);
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return { userId: user.id, suiAddress: user.suiAddress };
}

export async function optionalAuth(request: NextRequest): Promise<SessionData | null> {
  const suiAddress = request.cookies.get('suiAddress')?.value;

  if (!suiAddress) {
    return null;
  }

  const user = await registry.userRepository.findBySuiAddress(suiAddress);
  if (!user) {
    return null;
  }

  return { userId: user.id, suiAddress: user.suiAddress };
}
