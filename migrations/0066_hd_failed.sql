-- When Stream said it couldn't make a video's HD MP4: the 5-minute job stops asking about it (one more request, one
-- problem logged), instead of failing every run; null while the MP4 is awaited or once it's ready.
ALTER TABLE videos ADD COLUMN hd_failed_at TEXT;
