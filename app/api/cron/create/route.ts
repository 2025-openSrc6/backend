/**
 * POST /api/cron/rounds/create
 *
 * Job 1: Round Creator
 *
 * 실행 주기: 매일 4회 (라운드 시작 10분 전)
 *
 * 처리 내용:
 * 1. 마지막 라운드 조회
 * 2. 다음 시작 시각 계산
 * 3. rounds 테이블에 INSERT
 * 4. status = 'SCHEDULED'
 * 5. WebSocket 발행
 */
