-- A person a site admin has locked (the admin area's Users page): no sign-in and no way into any team while the row is
-- here, whatever teams they're on. Unlocking deletes the row; the Log keeps both. A person's, not a team's.
CREATE TABLE locked_people (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  locked_by TEXT NOT NULL,
  locked_at TEXT NOT NULL
);

-- The Log's lines for locking and unlocking: admin_log's action CHECK takes 'user_locked' and 'user_unlocked'. Rebuilt,
-- as SQLite can't change a CHECK in place: every row and column copied, and its one index made again.
CREATE TABLE admin_log_new (
  id INTEGER PRIMARY KEY,
  admin_email TEXT NOT NULL,
  team_id TEXT REFERENCES teams(id),
  action TEXT NOT NULL CHECK (action IN ('team_onboarded', 'team_edited', 'team_closed', 'team_reopened',
    'delete_scheduled', 'delete_cancelled', 'team_deleted', 'team_opened', 'view_as', 'support_done', 'test_email',
    'admin_added', 'admin_removed', 'support_replied', 'support_assigned', 'support_status',
    'member_added', 'member_changed', 'member_removed', 'member_let_in', 'player_added', 'player_changed', 'player_removed',
    'game_added', 'game_changed', 'game_deleted', 'video_deleted', 'video_moved',
    'live_app_chosen', 'live_app_camera', 'live_app_stopped', 'game_lines_changed',
    'live_started', 'live_ended', 'live_test', 'live_saved', 'live_continued', 'video_joined', 'join_failed', 'first_part_kept',
    'photo_added', 'photo_deleted', 'photo_kept', 'user_locked', 'user_unlocked')),
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  team_code TEXT,
  team_season INTEGER,
  device TEXT NOT NULL DEFAULT ''
);
INSERT INTO admin_log_new (id, admin_email, team_id, action, detail, created_at, team_code, team_season, device)
  SELECT id, admin_email, team_id, action, detail, created_at, team_code, team_season, device FROM admin_log;
DROP TABLE admin_log;
ALTER TABLE admin_log_new RENAME TO admin_log;
CREATE INDEX admin_log_created ON admin_log (created_at);
