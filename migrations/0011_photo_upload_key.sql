-- A key the phone makes for each photo it sends (public/photos.js), so a photo sent again because its answer was lost
-- (a weak signal) is found and not added twice: one photo a key, in each team. Photos from before, and from a page
-- opened before this, have none, and are added as before.
-- And the photos on show, in the Photos page's order, so a page of them, a photo's neighbours and its place are read
-- from the index rather than from every photo the team has added.
-- Both only add, so the code running now carries on as it is.
ALTER TABLE photos ADD COLUMN upload_key TEXT;
CREATE UNIQUE INDEX photos_team_upload_key ON photos (team_id, upload_key) WHERE upload_key IS NOT NULL;
CREATE INDEX photos_team_shown ON photos (team_id, taken_at, id) WHERE deleted_at IS NULL;
