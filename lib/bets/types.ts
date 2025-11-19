import type { Bet } from '@/db/schema/bets';

/**
 * 베팅 쿼리 파라미터
 */
export interface BetQueryParams {
  filters?: {
    roundId?: string;
    userId?: string;
    prediction?: 'GOLD' | 'BTC';
    resultStatus?: string;
    settlementStatus?: string;
  };
  sort?: 'created_at' | 'amount';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/**
 * 베팅 생성 입력
 */
export interface CreateBetInput {
  id: string;
  roundId: string;
  userId: string;
  prediction: 'GOLD' | 'BTC';
  amount: number;
  createdAt: number;
}

/**
 * 베팅 생성 결과
 */
export interface CreateBetResult {
  bet: Bet;
  round: {
    totalPool: number;
    totalGoldBets: number;
    totalBtcBets: number;
    totalBetsCount: number;
  };
  userBalance: {
    delBalance: number;
  };
}

/**
 * 베팅 목록 조회 결과
 */
export interface GetBetsResult {
  bets: Bet[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 베팅과 라운드 정보를 포함한 상세 정보
 */
export interface BetWithRound extends Bet {
  round?: {
    id: string;
    roundNumber: number;
    type: string;
    status: string;
    startTime: number;
    endTime: number;
  };
}
