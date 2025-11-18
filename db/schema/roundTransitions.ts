import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { rounds } from './rounds';

/**
 * round_transitions 테이블
 * - FSM 상태 전이 이력을 모두 기록하여 감사/디버깅에 활용
 * - 어떤 주체(CRON/ADMIN/API)가 어떤 이유로 상태를 바꿨는지 추적
 */
export const roundTransitions = sqliteTable(
  'round_transitions',
  {
    /** PK: 전이 UUID */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 라운드 FK */
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),

    /** 이전 상태 */
    fromStatus: text('from_status', { length: 20 }).notNull(),

    /** 이후 상태 */
    toStatus: text('to_status', { length: 20 }).notNull(),

    /** 트리거 주체: CRON_JOB / ADMIN / SYSTEM / API */
    triggeredBy: text('triggered_by', { length: 20 }).notNull(),

    /** 부가 메타데이터 (JSON string) */
    metadata: text('metadata'),

    /** 전이 발생 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    roundIdx: index('idx_round_transitions_round_id').on(table.roundId),
    createdAtIdx: index('idx_round_transitions_created_at').on(table.createdAt),
  }),
);

export type RoundTransition = typeof roundTransitions.$inferSelect;
export type NewRoundTransition = typeof roundTransitions.$inferInsert;
