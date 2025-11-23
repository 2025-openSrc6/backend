import { Round, RoundStatus } from './types';
import { registry } from '@/lib/registry';
import { isValidUUID } from '@/lib/shared/uuid';
import { BusinessRuleError, ValidationError } from '@/lib/shared/errors';

export const ALLOWED_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  SCHEDULED: ['BETTING_OPEN', 'CANCELLED'],
  BETTING_OPEN: ['BETTING_LOCKED', 'CANCELLED'],
  BETTING_LOCKED: ['PRICE_PENDING', 'CANCELLED'],
  PRICE_PENDING: ['CALCULATING', 'CANCELLED'],
  CALCULATING: ['SETTLED', 'VOIDED', 'CANCELLED'],
  SETTLED: [],
  CANCELLED: [],
  VOIDED: [],
};

/**
 * 라운드 상태 전이 가능 여부 검증
 * @param from 이전 상태
 * @param to 이후 상태
 * @returns 전이 가능 여부
 */
export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  const allowedStates = ALLOWED_TRANSITIONS[from];

  if (!allowedStates) {
    console.warn(`[FSM] Unknown status: ${from}`);
    return false;
  }

  return allowedStates.includes(to);
}

/**
 * 라운드 상태 전이 (핵심 함수)
 *
 * 보장 사항:
 * - 허용된 전이만 실행
 * - metadata 필수 필드 검증
 * - updated_at 자동 갱신
 * - 멱등성 보장
 *
 * @param roundId 라운드 ID
 * @param newStatus 새로운 상태
 * @param metadata 추가 업데이트 데이터 (각 전이별로 필수 필드 다름)
 * @returns 업데이트된 라운드
 *
 * @throws {ValidationError} roundId가 유효하지 않을 때
 * @throws {NotFoundError} 라운드를 찾을 수 없을 때 (Service에서 발생)
 * @throws {BusinessRuleError} 전이가 허용되지 않을 때
 */
export async function transitionRoundStatus(
  roundId: string,
  newStatus: RoundStatus,
  metadata?: Record<string, unknown>,
): Promise<Round> {
  // 입력 검증
  if (!isValidUUID(roundId)) {
    throw new ValidationError('Invalid UUID format', { roundId });
  }

  // 현재 라운드 조회
  const round = await registry.roundService.getRoundById(roundId);
  const currentStatus = round.status as RoundStatus;

  // 전이 가능 여부 검증
  if (!canTransition(currentStatus, newStatus)) {
    throw new BusinessRuleError(
      'INVALID_TRANSITION',
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      {
        roundId,
        currentStatus,
        newStatus,
        allowedTransitions: ALLOWED_TRANSITIONS[currentStatus],
      },
    );
  }

  // 멱등성 체크 (이미 목표 상태면 스킵)
  if (currentStatus === newStatus) {
    console.info(`[FSM] Round ${roundId} already in ${newStatus}, skipping transition`);
    return round;
  }

  // 각 전이 상태별 필수 필드 검증
  validateTransitionMetadata(currentStatus, newStatus, metadata);

  // 상태 업데이트 (RoundService 사용)
  const updatedRound = await registry.roundService.updateRoundById(roundId, {
    status: newStatus,
    ...metadata,
    updatedAt: Date.now(),
  });

  // 로깅
  console.info(`[FSM] Round ${roundId}: ${currentStatus} → ${newStatus}`);

  // 전이 이력 기록이 필요하면 여기서 수행합니다

  return updatedRound;
}

/**
 * 전이별 필수 필드 검증
 *
 * @private
 */
function validateTransitionMetadata(
  from: RoundStatus,
  to: RoundStatus,
  metadata?: Record<string, unknown>,
): void {
  if (!metadata) {
    // metadata가 없으면 검증 스킵 (Cron Job에서 필수 필드 제공 책임)
    console.warn(
      `[FSM] No metadata provided for transition from ${from} to ${to}, skipping validation`,
    );
    return;
  }

  // 각 전이별 필수 필드 검증
  const transition = `${from}_${to}`;

  switch (transition) {
    case 'SCHEDULED_BETTING_OPEN':
      validateRequired(metadata, [
        'goldStartPrice',
        'btcStartPrice',
        'priceSnapshotStartAt',
        'startPriceSource',
        'suiPoolAddress',
        'bettingOpenedAt',
      ]);
      break;

    case 'BETTING_OPEN_BETTING_LOCKED':
      validateRequired(metadata, ['bettingLockedAt']);
      break;

    case 'BETTING_LOCKED_PRICE_PENDING':
      validateRequired(metadata, ['roundEndedAt']);
      break;

    case 'PRICE_PENDING_CALCULATING':
      validateRequired(metadata, [
        'goldEndPrice',
        'btcEndPrice',
        'priceSnapshotEndAt',
        'endPriceSource',
        'goldChangePercent',
        'btcChangePercent',
        'winner',
      ]);
      break;

    case 'CALCULATING_SETTLED':
      validateRequired(metadata, [
        'platformFeeCollected',
        'suiSettlementObjectId',
        'settlementCompletedAt',
      ]);
      break;

    case 'CALCULATING_VOIDED':
      validateRequired(metadata, ['settlementCompletedAt']);
      break;

    // CANCELLED는 필수 필드 없음
    default:
      break;
  }
}

/**
 * 필수 필드 검증 헬퍼
 *
 * @private
 */
function validateRequired(metadata: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter(
    (field) => metadata[field] === undefined || metadata[field] === null,
  );

  if (missing.length > 0) {
    throw new ValidationError('Missing required metadata fields', {
      missing,
      provided: Object.keys(metadata),
    });
  }
}
