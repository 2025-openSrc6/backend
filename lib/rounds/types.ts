/**
 * Rounds 도메인 타입 정의
 *
 * DB 스키마(schema.ts)와 별도로 비즈니스 로직에서 사용하는 타입들.
 * Service와 Repository 간 데이터 교환에 사용됨.
 */

import { rounds } from '@/db/schema';

/**
 * 라운드 타입 (베팅 주기)
 */
export type RoundType = '1MIN' | '6HOUR' | '1DAY';

/**
 * 라운드 상태 (FSM 상태)
 *
 * 상태 전이는 FSM.md 참조
 */
export type RoundStatus =
  | 'SCHEDULED' // 생성됨, 시작 대기 중
  | 'BETTING_OPEN' // 베팅 가능
  | 'BETTING_LOCKED' // 베팅 마감, 라운드 진행 중
  | 'CALCULATING' // 정산 계산 중
  | 'SETTLED' // 정산 완료
  | 'CANCELLED' // 취소됨 (환불)
  | 'VOIDED'; // 무효화됨 (무승부)

/**
 * 정렬 가능한 필드
 */
export type RoundSortField = 'start_time' | 'round_number';

/**
 * 정렬 순서
 */
export type SortOrder = 'asc' | 'desc';

/**
 * DB에서 조회한 Round 타입
 */
export type Round = typeof rounds.$inferSelect;

/**
 * Round 생성 시 입력 타입
 */
export type RoundInsert = typeof rounds.$inferInsert;

/**
 * GET /api/rounds 쿼리 파라미터 (파싱 후)
 */
export interface GetRoundsQueryParams {
  type?: RoundType;
  statuses?: RoundStatus[];
  page: number;
  pageSize: number;
  sort: RoundSortField;
  order: SortOrder;
}

/**
 * Repository에서 사용하는 필터 타입
 */
export interface RoundFilters {
  type?: RoundType;
  statuses?: RoundStatus[];
}

/**
 * Repository에서 사용하는 쿼리 파라미터
 */
export interface RoundQueryParams {
  filters: RoundFilters;
  sort: RoundSortField;
  order: SortOrder;
  limit: number;
  offset: number;
}

/**
 * GET /api/rounds 응답 타입 (data 부분)
 */
export interface GetRoundsResult {
  rounds: Round[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// FSM

/**
 * SCHEDULED → BETTING_OPEN 전이 시 필요한 데이터
 */
export interface OpenRoundMetadata {
  goldStartPrice: string; // 필수
  btcStartPrice: string; // 필수
  priceSnapshotStartAt: number; // Epoch milliseconds, 필수
  startPriceSource: string; // 'kitco' | 'coingecko' | 'average'
  startPriceIsFallback?: boolean; // 기본값: false
  startPriceFallbackReason?: string; // fallback인 경우 사유
  suiPoolAddress?: string; // Sui BettingPool Object ID, Week 2까지 옵셔널
  bettingOpenedAt: number; // Epoch milliseconds, 필수
}

/**
 * BETTING_OPEN → BETTING_LOCKED 전이 시 필요한 데이터
 */
export interface LockRoundMetadata {
  bettingLockedAt: number; // Epoch milliseconds, 필수
}

/**
 * BETTING_LOCKED → CALCULATING 전이 시 필요한 데이터
 */
export interface FinalizeRoundMetadata {
  roundEndedAt: number; // Epoch milliseconds, 필수
  goldEndPrice: string; // 필수
  btcEndPrice: string; // 필수
  priceSnapshotEndAt: number; // Epoch milliseconds, 필수
  endPriceSource: string; // (미정)
  endPriceIsFallback?: boolean; // 기본값: false
  endPriceFallbackReason?: string; // fallback인 경우 사유
  goldChangePercent: string; // 변동률, 필수
  btcChangePercent: string; // 변동률, 필수
  winner: RoundWinner; // 필수, DRAW 제거 (동률 시 금 승리)
}

/**
 * 승자 타입 (DRAW 제거됨 - 동률 시 금 승리)
 */
export type RoundWinner = 'GOLD' | 'BTC';

// Calculator Types

/**
 * 승자 판정 입력 파라미터
 */
export interface DetermineWinnerParams {
  goldStart: number; // 금 시작 가격 (USD/oz)
  goldEnd: number; // 금 종료 가격 (USD/oz)
  btcStart: number; // BTC 시작 가격 (USD)
  btcEnd: number; // BTC 종료 가격 (USD)
}

/**
 * 승자 판정 결과
 */
export interface DetermineWinnerResult {
  winner: RoundWinner;
  goldChangePercent: number;
  btcChangePercent: number;
}

/**
 * 배당 계산 입력 파라미터
 */
export interface CalculatePayoutParams {
  winner: RoundWinner;
  totalPool: number; // 총 베팅 풀
  totalGoldBets: number; // 금 베팅 총액
  totalBtcBets: number; // BTC 베팅 총액
  platformFeeRate: number; // 플랫폼 수수료율 (예: 0.05 = 5%)
}

/**
 * 배당 계산 결과
 */
export interface CalculatePayoutResult {
  platformFee: number; // 플랫폼 수수료
  payoutPool: number; // 배당 풀 (수수료 제외)
  payoutRatio: number; // 배당 비율 (승자 1원당 받는 금액)
  winningPool: number; // 승자 풀
  losingPool: number; // 패자 풀
}

/**
 * CALCULATING → SETTLED 전이 시 필요한 데이터
 */
export interface SettleRoundMetadata {
  platformFeeCollected: number; // 실제 징수 금액, 필수
  suiSettlementObjectId?: string; // Sui Settlement Object ID, Week 2까지 옵셔널
  settlementCompletedAt: number; // Epoch milliseconds, 필수
}

/**
 * CALCULATING → VOIDED 전이 시 필요한 데이터
 */
export interface VoidRoundMetadata {
  settlementCompletedAt: number; // Epoch milliseconds, 필수
  // winner는 이미 'DRAW'로 설정되어 있어야 함
}

/**
 * ANY → CANCELLED 전이 시 필요한 데이터
 */
// export interface CancelRoundMetadata {
//   // 현재 스키마에는 취소 사유 필드가 없음
//   // Week 2+에서 추가 예정
//   // cancellationReason?: string;
//   // cancelledBy?: string;
//   // cancelledAt: number;
// }

/**
 * 모든 전이에서 사용 가능한 metadata 타입
 */
export type TransitionMetadata =
  | OpenRoundMetadata
  | LockRoundMetadata
  | FinalizeRoundMetadata
  | SettleRoundMetadata
  | VoidRoundMetadata;
// | CancelRoundMetadata;

// ============================================
// Cron Job Service Types
// ============================================

/**
 * 가격 데이터 (외부 API에서 가져온 스냅샷)
 */
export interface PriceData {
  gold: number;
  btc: number;
  timestamp: number; // Epoch milliseconds
  source: string; // 'kitco' | 'coingecko' | 'mock' 등
}

/**
 * openRound 결과 상태
 */
export type OpenRoundStatus = 'opened' | 'no_round' | 'not_ready' | 'cancelled';

/**
 * Service.openRound() 반환 타입
 */
export interface OpenRoundResult {
  status: OpenRoundStatus;
  round?: Round;
  message?: string;
}

export type LockRoundStatus = 'locked' | 'no_round' | 'not_ready' | 'cancelled';
export interface LockRoundResult {
  status: LockRoundStatus;
  round?: Round;
  message?: string;
}

export type FinalizeRoundStatus = 'finalized' | 'no_round' | 'not_ready' | 'cancelled';
export interface FinalizeRoundResult {
  status: FinalizeRoundStatus;
  round?: Round;
  message?: string;
}

/**
 * settleRound 결과 상태
 */
export type SettleRoundStatus = 'settled' | 'already_settled' | 'no_bets' | 'partial' | 'failed';

/**
 * Service.settleRound() 반환 타입
 */
export interface SettleRoundResult {
  status: SettleRoundStatus;
  roundId: string;
  settledCount?: number;
  failedCount?: number;
  totalPayout?: number;
  message?: string;
}
