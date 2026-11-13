-- When a video's processing began (its upload finished, or an app's recording was first seen): Insights' stuck count and
-- Right now count from here, not from the row's creation, which for a Go live recording is the Go live tap. Null for
-- videos processed before this, which count from created_at as before.
ALTER TABLE videos ADD COLUMN processing_at TEXT;
