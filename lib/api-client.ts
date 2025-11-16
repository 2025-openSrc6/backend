/**
 * API 클라이언트 - 프론트엔드에서 DB 작업을 하기 위한 헬퍼
 */

import type { Round } from '@/db/schema/rounds';
import type { Bet } from '@/db/schema/bets';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type CreateRoundPayload = {
  roundNumber: number;
  type: '1MIN' | '6HOUR' | '1DAY';
  startTime: string;
  lockTime: string;
  endTime: string;
  status?:
    | 'SCHEDULED'
    | 'BETTING_OPEN'
    | 'BETTING_LOCKED'
    | 'PRICE_PENDING'
    | 'CALCULATING'
    | 'SETTLED'
    | 'CANCELLED'
    | 'VOIDED';
};

type CreateBetPayload = {
  roundId: string;
  userId?: string;
  userAddress?: string;
  walletAddress?: string;
  selection: 'gold' | 'btc' | 'GOLD' | 'BTC';
  amount: string | number;
  currency?: 'DEL' | 'CRYSTAL';
  txDigest?: string;
};

/**
 * 새로운 라운드를 생성합니다
 */
export async function createRound(roundData: CreateRoundPayload) {
  const response = await fetch('/api/rounds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(roundData),
  });

  if (!response.ok) {
    throw new Error(`Failed to create round: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<Round | Round[]>;
}

/**
 * 모든 라운드를 조회합니다
 */
export async function fetchRounds() {
  const response = await fetch('/api/rounds', {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch rounds: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<Round[]>;
}

/**
 * 새로운 베팅을 생성합니다
 */
export async function createBet(betData: CreateBetPayload) {
  const response = await fetch('/api/bets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(betData),
  });

  if (!response.ok) {
    throw new Error(`Failed to create bet: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<Bet>;
}

/**
 * 특정 라운드의 베팅을 조회합니다
 */
export async function fetchBets(roundId?: number) {
  const url = new URL('/api/bets', window.location.origin);
  if (roundId) {
    url.searchParams.set('roundId', roundId.toString());
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch bets: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<Bet[]>;
}

/**
 * DB 연결 상태를 확인합니다
 */
export async function checkHealth() {
  const response = await fetch('/api/health', {
    method: 'GET',
  });

  return (await response.json()) as ApiResponse<null>;
}
