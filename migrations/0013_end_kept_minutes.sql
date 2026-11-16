-- Go live's End game says how many minutes of the game were still only on the filming phone (a weak signal sends the
-- recording behind the game, and the phone keeps what it hasn't sent). With any, the 5-minute job waits for the phone as
-- long as it does with no End game before saving what reached the site by itself. Null: none said (an app's stream, a
-- page that doesn't say, or a stream not ended).
ALTER TABLE live_streams ADD COLUMN end_kept_minutes INTEGER;
