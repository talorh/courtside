-- The whole schema in one migration: every table, index and constraint the site needs, as a fresh install starts.
-- Later changes come as further numbered migrations (docs/development-standards.md: additive, each applied once by
-- `cf d1 migrations apply`). The first site admin is added by `npm run admin -- add <email>`, not here.
CREATE TABLE "activity" (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  kind TEXT NOT NULL CHECK (kind IN ('upload_started', 'upload_finished', 'video_ready', 'video_failed', 'hd_ready', 'clip_made',
    'removal_requested', 'clip_removal_requested', 'live_started', 'live_saved', 'photo_removal_requested',
    'video_deleted', 'game_deleted')),
  game_id INTEGER,
  member_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
, device TEXT NOT NULL DEFAULT '');

CREATE TABLE "admin_log" (
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
    'photo_added', 'photo_deleted', 'photo_kept')),
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  team_code TEXT,
  team_season INTEGER,
  device TEXT NOT NULL DEFAULT ''
);

CREATE TABLE admins (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  removed_at TEXT
);

CREATE TABLE ask_counts (
  team_id TEXT NOT NULL REFERENCES teams(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, member_id, day)
);

CREATE TABLE billed_usage (
  day TEXT NOT NULL,
  service TEXT NOT NULL,
  family TEXT NOT NULL,
  quantity REAL NOT NULL,
  billable REAL NOT NULL,
  unit TEXT NOT NULL,
  billed REAL NOT NULL,
  period_start TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (day, service)
);

CREATE TABLE clip_players (
  team_id TEXT NOT NULL REFERENCES teams(id),
  clip_id INTEGER NOT NULL REFERENCES clips(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  PRIMARY KEY (clip_id, player_id)
);

CREATE TABLE clip_removal_requests (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  clip_id INTEGER NOT NULL REFERENCES clips(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'clip_deleted', 'kept')),
  note TEXT NOT NULL DEFAULT '',
  resolved_by INTEGER REFERENCES members(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE clips (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  video_id INTEGER NOT NULL REFERENCES videos(id),
  label TEXT NOT NULL,
  start_seconds INTEGER NOT NULL CHECK (start_seconds >= 0),
  end_seconds INTEGER NOT NULL CHECK (end_seconds > start_seconds),
  status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
  stream_uid TEXT UNIQUE,
  failure_reason TEXT,
  created_by INTEGER REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE coach_notes (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  at_seconds INTEGER CHECK (at_seconds IS NULL OR at_seconds >= 0),
  body TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE cost_views (
  month TEXT NOT NULL,
  team_id TEXT NOT NULL,
  minutes REAL NOT NULL CHECK (minutes >= 0),
  saved_at TEXT NOT NULL,
  PRIMARY KEY (month, team_id)
);

CREATE TABLE docs_ask_counts (
  email TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, day)
);

CREATE TABLE downloads (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  video_id INTEGER NOT NULL REFERENCES videos(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  kind TEXT NOT NULL CHECK (kind IN ('hd', 'original')),
  created_at TEXT NOT NULL
);

CREATE TABLE email_months (
  month TEXT PRIMARY KEY,
  sent INTEGER NOT NULL DEFAULT 0 CHECK (sent >= 0)
);

CREATE TABLE exchange_rates (
  pair TEXT PRIMARY KEY CHECK (pair IN ('USD/AUD')),
  rate REAL NOT NULL CHECK (rate > 0),
  rate_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE favourites (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  game_id INTEGER REFERENCES games(id),
  clip_id INTEGER REFERENCES clips(id),
  created_at TEXT NOT NULL,
  CHECK ((game_id IS NULL) <> (clip_id IS NULL))
);

CREATE TABLE "game_lines" (
  team_id TEXT NOT NULL REFERENCES teams(id),
  kind TEXT NOT NULL CHECK (kind IN ('upcoming', 'away', 'rivals_upcoming', 'playing', 'rivals_playing', 'played', 'rivals_played',
    'won', 'won_by_one', 'lost', 'drew')),
  lines TEXT NOT NULL CHECK (length(lines) BETWEEN 1 AND 5000),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, kind)
);

CREATE TABLE game_scores (
  team_id TEXT NOT NULL REFERENCES teams(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  ours INTEGER NOT NULL CHECK (ours BETWEEN 0 AND 300),
  opponent INTEGER NOT NULL CHECK (opponent BETWEEN 0 AND 300),
  source TEXT NOT NULL CHECK (source IN ('playhq', 'manual')),
  entered_by INTEGER REFERENCES members(id),
  entered_at TEXT NOT NULL,
  PRIMARY KEY (team_id, game_id)
);

CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  starts_at TEXT NOT NULL,
  competition TEXT NOT NULL CHECK (competition IN ('VJBL', 'Tournament', 'Practice match')),
  round_label TEXT NOT NULL DEFAULT '',
  opponent TEXT NOT NULL DEFAULT 'TBC',
  venue TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
, no_video_at TEXT, playhq_game_id TEXT, playhq_fixture_id INTEGER, playhq_gone_at TEXT, live_stream INTEGER NOT NULL DEFAULT 1 CHECK (live_stream IN (0, 1)), score_checked_at TEXT, no_video_auto_at TEXT, waiting_since TEXT);

CREATE TABLE live_streams (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  live_input_uid TEXT NOT NULL UNIQUE,
  started_by INTEGER REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'saved', 'cancelled')),
  -- Last time the cron job saw a broadcast in progress (or first saw a finished one). NULL until then.
  last_live_at TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
, end_requested_at TEXT, cancel_reason TEXT, recording_video_id INTEGER REFERENCES videos(id), source TEXT NOT NULL DEFAULT 'camera' CHECK (source IN ('camera', 'app')));

CREATE TABLE media_downloads (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'clip')),
  item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('watcher', 'filmer', 'coach', 'manager')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  removed_at TEXT,
  hide_scores INTEGER NOT NULL DEFAULT 0 CHECK (hide_scores IN (0, 1)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  UNIQUE (team_id, email)
);

CREATE TABLE photo_removal_requests (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  photo_id INTEGER NOT NULL REFERENCES photos(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'photo_deleted', 'kept')),
  note TEXT NOT NULL DEFAULT '',
  resolved_by INTEGER REFERENCES members(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE photos (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  image_id TEXT NOT NULL UNIQUE,
  taken_at TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  uploaded_by INTEGER NOT NULL REFERENCES members(id),
  delete_after TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_reason TEXT CHECK (deleted_reason IN ('admin', 'removal_request', 'retention'))
);

CREATE TABLE "platform_alerts" (
  kind TEXT PRIMARY KEY CHECK (kind IN ('stream_storage', 'images', 'daily_job', 'sync_job', 'database', 'site_errors', 'email', 'email_allowance', 'budget', 'ai_models', 'joiner')),
  level TEXT NOT NULL CHECK (level IN ('ok', 'warn', 'urgent')),
  detail TEXT NOT NULL DEFAULT '',
  since TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  ticket_id INTEGER REFERENCES support_requests(id)
);

CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  removed_at TEXT
);

CREATE TABLE playhq_fixtures (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  competition TEXT NOT NULL CHECK (competition IN ('VJBL', 'Tournament')),
  playhq_team_id TEXT NOT NULL,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  auto_check INTEGER NOT NULL DEFAULT 1,
  game_count INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
, no_video INTEGER NOT NULL DEFAULT 0);

CREATE TABLE problems (
  id INTEGER PRIMARY KEY,
  team_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('server_error', 'job_failed', 'email_failed', 'golive_problem', 'upload_problem',
    'photo_problem', 'stream_problem', 'ai_failed', 'site_problem')),
  who TEXT NOT NULL,
  what TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  times INTEGER NOT NULL DEFAULT 1 CHECK (times > 0),
  first_at TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE recording_segments (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  video_id INTEGER NOT NULL REFERENCES videos(id),
  n INTEGER NOT NULL CHECK (n >= 2),
  r2_key TEXT NOT NULL,
  r2_upload_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (video_id, n)
);

CREATE TABLE removal_requests (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  video_id INTEGER NOT NULL REFERENCES videos(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'video_deleted', 'kept')),
  note TEXT NOT NULL DEFAULT '',
  resolved_by INTEGER REFERENCES members(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE roster_duties (
  team_id TEXT PRIMARY KEY REFERENCES teams(id),
  lollies INTEGER NOT NULL DEFAULT 1 CHECK (lollies IN (0, 1)),
  lollies_label TEXT NOT NULL DEFAULT 'Lollies' CHECK (length(lollies_label) BETWEEN 1 AND 30),
  lollies_family_id INTEGER REFERENCES roster_families(id),
  video INTEGER NOT NULL DEFAULT 1 CHECK (video IN (0, 1)),
  video_family_id INTEGER REFERENCES roster_families(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE roster_families (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  surname TEXT NOT NULL,
  removed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
, away TEXT NOT NULL DEFAULT '[]');

CREATE TABLE "roster_slots" (
  team_id TEXT NOT NULL REFERENCES teams(id),
  week TEXT NOT NULL,
  duty TEXT NOT NULL CHECK (duty IN ('scoring', 'lollies', 'video')),
  position INTEGER NOT NULL DEFAULT 1,
  game_id INTEGER NOT NULL CHECK (game_id > 0),
  family_id INTEGER NOT NULL REFERENCES roster_families(id),
  by_hand INTEGER NOT NULL DEFAULT 0 CHECK (by_hand IN (0, 1)),
  PRIMARY KEY (team_id, week, duty, position, game_id)
);

CREATE TABLE roster_weeks (
  team_id TEXT NOT NULL REFERENCES teams(id),
  week TEXT NOT NULL,
  extra_off INTEGER NOT NULL DEFAULT 0 CHECK (extra_off IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, week)
);

CREATE TABLE server_errors (
  hour TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  device TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  ended_at TEXT
, view TEXT CHECK (view IN ('desktop', 'mobile')), counted_week TEXT);

CREATE TABLE sign_in_codes (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  voided_at TEXT
);

CREATE TABLE "sign_in_events" (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('code_sent', 'unknown_email', 'limited', 'wrong', 'signed_in', 'robot', 'desktop_view', 'mobile_view')),
  email TEXT NOT NULL COLLATE NOCASE,
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
, device TEXT NOT NULL DEFAULT '');

CREATE TABLE sign_in_holds (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  until TEXT NOT NULL,
  count_from TEXT NOT NULL
);

CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES support_requests(id),
  team_id TEXT REFERENCES teams(id),
  kind TEXT NOT NULL CHECK (kind IN ('reply', 'note', 'event')),
  member_id INTEGER REFERENCES members(id),
  admin_email TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  email_to TEXT,
  emailed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (member_id IS NULL OR admin_email IS NULL),
  CHECK (kind <> 'note' OR admin_email IS NOT NULL)
);

CREATE TABLE "support_requests" (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'team' CHECK (source IN ('team', 'site')),
  team_id TEXT REFERENCES teams(id),
  member_id INTEGER REFERENCES members(id),
  alert_kind TEXT,
  title TEXT,
  topic TEXT NOT NULL CHECK (topic IN ('members', 'videos', 'live', 'fixture', 'other', 'platform')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'open', 'waiting', 'resolved')),
  assigned_to TEXT,
  emailed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  resolved_by TEXT, kind TEXT NOT NULL DEFAULT 'support' CHECK (kind IN ('support', 'feature')), stage TEXT CHECK (stage IN ('considering', 'planned', 'shipped', 'declined')),
  CHECK ((source = 'team' AND team_id IS NOT NULL AND member_id IS NOT NULL AND alert_kind IS NULL)
    OR (source = 'site' AND team_id IS NULL AND member_id IS NULL AND alert_kind IS NOT NULL AND title IS NOT NULL))
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code GLOB '[bg][0-9]*.[0-9]*'),
  season_start INTEGER NOT NULL CHECK (season_start BETWEEN 2026 AND 2100),
  ask_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at TEXT,
  delete_after TEXT,
  deleted_at TEXT
, budget REAL CHECK (budget IS NULL OR budget >= 0));

CREATE TABLE video_views (
  team_id TEXT NOT NULL REFERENCES teams(id),
  video_id INTEGER NOT NULL REFERENCES videos(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  opened_at TEXT NOT NULL,
  PRIMARY KEY (video_id, member_id)
);

CREATE TABLE videos (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  stream_uid TEXT UNIQUE,
  r2_key TEXT UNIQUE,
  r2_upload_id TEXT,
  original_name TEXT,
  original_bytes INTEGER,
  duration_seconds INTEGER,
  failure_reason TEXT,
  uploaded_by INTEGER REFERENCES members(id),
  delete_after TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  deleted_reason TEXT
, hd_ready_at TEXT, purge_after TEXT, join_tries INTEGER NOT NULL DEFAULT 0, join_tried_at TEXT, join_failed_at TEXT);

CREATE TABLE view_weeks (
  week TEXT NOT NULL,
  view TEXT NOT NULL CHECK (view IN ('desktop', 'mobile')),
  devices INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, view)
);

CREATE INDEX activity_created ON activity (created_at);

CREATE INDEX activity_team_created ON activity (team_id, created_at);

CREATE INDEX admin_log_created ON admin_log (created_at);

CREATE INDEX clip_players_player ON clip_players (team_id, player_id);

CREATE INDEX clip_removal_team_status ON clip_removal_requests (team_id, status);

CREATE INDEX clips_team_status ON clips (team_id, status);

CREATE INDEX clips_team_video ON clips (team_id, video_id);

CREATE INDEX coach_notes_team_game ON coach_notes (team_id, game_id);

CREATE INDEX downloads_team_created ON downloads (team_id, created_at);

CREATE UNIQUE INDEX favourites_clip ON favourites (team_id, member_id, clip_id) WHERE clip_id IS NOT NULL;

CREATE UNIQUE INDEX favourites_game ON favourites (team_id, member_id, game_id) WHERE game_id IS NOT NULL;

CREATE UNIQUE INDEX games_team_playhq ON games (team_id, playhq_game_id) WHERE playhq_game_id IS NOT NULL;

CREATE INDEX games_team_starts ON games (team_id, starts_at);

CREATE UNIQUE INDEX live_streams_one_open_per_game ON live_streams (game_id) WHERE status = 'open';

CREATE INDEX live_streams_team_status ON live_streams (team_id, status);

CREATE INDEX media_downloads_team_created ON media_downloads (team_id, created_at);

CREATE INDEX members_email ON members (email) WHERE removed_at IS NULL;

CREATE INDEX photo_removal_team_status ON photo_removal_requests (team_id, status);

CREATE INDEX photos_team_delete_after ON photos (team_id, delete_after);

CREATE INDEX photos_team_taken ON photos (team_id, taken_at);

CREATE INDEX players_team ON players (team_id, number);

CREATE UNIQUE INDEX players_team_number ON players (team_id, number) WHERE removed_at IS NULL;

CREATE UNIQUE INDEX playhq_fixtures_team ON playhq_fixtures (team_id, playhq_team_id);

CREATE INDEX problems_at ON problems (at);

CREATE INDEX problems_team ON problems (team_id);

CREATE INDEX recording_segments_team ON recording_segments (team_id, video_id);

CREATE INDEX removal_team_status ON removal_requests (team_id, status);

CREATE UNIQUE INDEX roster_families_surname ON roster_families (team_id, surname COLLATE NOCASE) WHERE removed_at IS NULL;

CREATE INDEX roster_slots_family ON roster_slots (team_id, family_id);

CREATE UNIQUE INDEX roster_slots_one_a_game ON roster_slots (team_id, week, game_id, family_id);

CREATE INDEX sessions_email ON sessions (email);

CREATE INDEX sign_in_codes_email ON sign_in_codes (email, created_at);

CREATE INDEX sign_in_events_at ON sign_in_events (at);

CREATE INDEX support_messages_request ON support_messages (request_id, id);

CREATE INDEX support_messages_unsent ON support_messages (created_at) WHERE email_to IS NOT NULL AND emailed_at IS NULL;

CREATE INDEX support_requests_kind ON support_requests (kind, status, updated_at);

CREATE UNIQUE INDEX support_requests_site_open ON support_requests (alert_kind) WHERE source = 'site' AND status <> 'resolved';

CREATE INDEX support_requests_status ON support_requests (status, updated_at);

CREATE INDEX support_requests_team ON support_requests (team_id, member_id, created_at);

CREATE UNIQUE INDEX teams_active_code ON teams (code) WHERE status = 'active';

CREATE INDEX video_views_team_opened ON video_views (team_id, opened_at);

CREATE UNIQUE INDEX videos_one_per_game ON videos (game_id) WHERE deleted_at IS NULL AND status <> 'failed';

CREATE INDEX videos_team_delete_after ON videos (team_id, delete_after);

CREATE INDEX videos_team_game ON videos (team_id, game_id);

CREATE INDEX videos_team_purge_after ON videos (team_id, purge_after) WHERE purge_after IS NOT NULL;

CREATE INDEX videos_team_status ON videos (team_id, status);

