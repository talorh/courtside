-- Which clips are another part of an external app's stream (the site makes those, not a person), so the daily limits on
-- the clip minutes a member and a team make count only the clips people make. Parts already saved are the ones named
-- "Live stream, more from …" from the start. And the clips made by time, for those limits' counts.
-- Both only add, so the code running now carries on as it is.
ALTER TABLE clips ADD COLUMN part INTEGER NOT NULL DEFAULT 0 CHECK (part IN (0, 1));
UPDATE clips SET part = 1 WHERE start_seconds = 0 AND label LIKE 'Live stream, more from %';
CREATE INDEX clips_team_made ON clips (team_id, created_at);
