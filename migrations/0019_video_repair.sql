-- When a Go live recording Stream refused was sent to the joiner to be copied into a fresh file (live/repair-service.ts):
-- once only, so one it still refuses fails as any video does. Null for every other video.
ALTER TABLE videos ADD COLUMN repair_tried_at TEXT;
