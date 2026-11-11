-- The Friday check's alert (features/admin/game-day-checks.ts): are the weekend's games good to go. The kind's CHECK
-- takes 'game_day'. Rebuilt with every row copied, so the live code reads the table as before.
CREATE TABLE platform_alerts_new (
  kind TEXT PRIMARY KEY CHECK (kind IN ('stream_storage', 'images', 'daily_job', 'sync_job', 'database', 'site_errors', 'email', 'email_allowance', 'budget', 'ai_models', 'joiner', 'game_day')),
  level TEXT NOT NULL CHECK (level IN ('ok', 'warn', 'urgent')),
  detail TEXT NOT NULL DEFAULT '',
  since TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  ticket_id INTEGER REFERENCES support_requests(id)
);
INSERT INTO platform_alerts_new (kind, level, detail, since, failures, checked_at, ticket_id)
  SELECT kind, level, detail, since, failures, checked_at, ticket_id FROM platform_alerts;
DROP TABLE platform_alerts;
ALTER TABLE platform_alerts_new RENAME TO platform_alerts;
