-- Each Request access try (the sign-in page's "Can't get in?") is a sign-in event of its own kind, 'access', so the
-- form's tries from one internet address can be limited and the admin Log shows them. sign_in_events is rebuilt for
-- the new kind: SQLite can't change a CHECK in place. Every column comes across (device too) with its id, and the one
-- index is made again. The new CHECK keeps every kind the code before writes, and that code never writes 'access', so
-- it runs on the rebuilt table as it did on the old.
CREATE TABLE sign_in_events_new (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('code_sent', 'unknown_email', 'limited', 'wrong', 'signed_in', 'robot', 'desktop_view', 'mobile_view', 'access')),
  email TEXT NOT NULL COLLATE NOCASE,
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT ''
);
INSERT INTO sign_in_events_new (id, kind, email, ip, at, device) SELECT id, kind, email, ip, at, device FROM sign_in_events;
DROP TABLE sign_in_events;
ALTER TABLE sign_in_events_new RENAME TO sign_in_events;
CREATE INDEX sign_in_events_at ON sign_in_events (at);
