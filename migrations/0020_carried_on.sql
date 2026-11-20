-- When a Go live recording was first carried on after its page closed (live/browser-live-continue.ts). Its segments'
-- rows go once they're joined or its first part is kept, so this is what still says so: such a video is never thrown
-- away as a test once processed, however short (live/browser-live-stop.ts dropShortTest). Only adds a column, filled
-- for the videos that still show it (segments waiting, or a joined file).
ALTER TABLE videos ADD COLUMN carried_on_at TEXT;
UPDATE videos SET carried_on_at = created_at
  WHERE id IN (SELECT video_id FROM recording_segments WHERE recording_segments.team_id = videos.team_id) OR r2_key LIKE '%.joined.%';
