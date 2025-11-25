import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

/**
 * users 테이블
 * - 온체인 지갑 주소를 기준으로 식별하는 기본 유저 프로필 및 재화/통계 정보
 * - DEL/CRYSTAL 잔액과 출석, 누적 베팅 통계를 모두 단일 행에서 관리
 */
export const users = sqliteTable(
  'users',
  {
    /** PK: 내부에서 사용하는 UUID (프론트/백 모두 공통 식별자) */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** 지갑 주소 (0x...) - 고유해야 하며 실명 대신 주소 일부를 표시할 수 있음 */
    suiAddress: text('sui_address', { length: 80 }).notNull(),

    /** 유저가 설정한 닉네임 (미설정 시 NULL -> 클라이언트에서 주소 뒷자리 사용) */
    nickname: text('nickname', { length: 50 }),

    /** UI 테마 색상 - Tailwind color hex 형태로 저장 */
    profileColor: text('profile_color', { length: 20 }).notNull().default('#3B82F6'),

    /** DEL 보유량 (정수, 최소 0) */
    delBalance: integer('del_balance', { mode: 'number' }).notNull().default(0),

    /** CRYSTAL 보유량 (정수, 최소 0) */
    crystalBalance: integer('crystal_balance', { mode: 'number' }).notNull().default(0),

    /** 누적 베팅 횟수 (랭킹/통계용) */
    totalBets: integer('total_bets', { mode: 'number' }).notNull().default(0),

    /** 누적 승리 횟수 (totalBets 이하) */
    totalWins: integer('total_wins', { mode: 'number' }).notNull().default(0),

    /** 누적 베팅 금액 (DEL 단위) */
    totalVolume: integer('total_volume', { mode: 'number' }).notNull().default(0),

    /** 마지막 출석 체크 시각 (Epoch milliseconds) */
    lastAttendanceAt: integer('last_attendance_at', { mode: 'number' }),

    /** 연속 출석 일수 */
    attendanceStreak: integer('attendance_streak', { mode: 'number' }).notNull().default(0),

    /** 닉네임 컬러 (Hex code or 'RAINBOW') */
    nicknameColor: text('nickname_color'),

    /** 부스트 만료 시간 (Epoch milliseconds) */
    boostUntil: integer('boost_until', { mode: 'number' }),

    /** Green Mushroom 보유량 */
    greenMushrooms: integer('green_mushrooms', { mode: 'number' }).default(0),

    /** 생성 시각 (Epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),

    /** 마지막 업데이트 시각 (Epoch milliseconds) */
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    suiAddressIdx: uniqueIndex('idx_users_sui_address').on(table.suiAddress),
    createdAtIdx: index('idx_users_created_at').on(table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
