-- 샘플 라운드 추가
INSERT INTO rounds (round_key, timeframe, status, locking_starts_at, locking_ends_at, created_at, updated_at)
VALUES
  ('round-2025-01-10-1h', '1h', 'scheduled', datetime('2025-01-10 10:00:00'), datetime('2025-01-10 11:00:00'), datetime('now'), datetime('now')),
  ('round-2025-01-10-6h', '6h', 'scheduled', datetime('2025-01-10 12:00:00'), datetime('2025-01-10 18:00:00'), datetime('now'), datetime('now')),
  ('round-2025-01-10-1d', '1d', 'active', datetime('2025-01-09 00:00:00'), datetime('2025-01-10 00:00:00'), datetime('now'), datetime('now'));

-- 샘플 베팅 추가
INSERT INTO bets (round_id, wallet_address, selection, amount, created_at)
VALUES
  (1, '0x1111111111111111111111111111111111111111', 'gold', 100.50, datetime('now')),
  (1, '0x2222222222222222222222222222222222222222', 'btc', 50.25, datetime('now')),
  (2, '0x3333333333333333333333333333333333333333', 'gold', 200.00, datetime('now')),
  (3, '0x1111111111111111111111111111111111111111', 'btc', 75.75, datetime('now'));
