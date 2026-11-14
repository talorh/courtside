-- When the game check (8 hours before tip-off, the 5-minute job) last looked at a live game, so each game is checked
-- once as it comes within 8 hours. Null: not checked yet.
ALTER TABLE games ADD COLUMN ready_checked_at TEXT;
