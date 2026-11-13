-- The league is the club's (CLUB.league in src/club.ts), not one named by the schema: games and PlayHQ fixtures take any
-- competition (the code offers the league, Tournament and, for games, Practice match). SQLite can't drop a CHECK, so each
-- table is made again without it: a copy of its rows, the table dropped and made afresh, the rows put back, its indexes
-- made again. Foreign keys (videos, live streams, scores, notes and favourites name their game) are deferred to the end
-- of this migration's transaction, by which time every game is back under its own id.
PRAGMA defer_foreign_keys = true;

CREATE TABLE games_backup AS SELECT * FROM games;
DROP TABLE games;
CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  starts_at TEXT NOT NULL,
  competition TEXT NOT NULL,
  round_label TEXT NOT NULL DEFAULT '',
  opponent TEXT NOT NULL DEFAULT 'TBC',
  venue TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  no_video_at TEXT,
  playhq_game_id TEXT,
  playhq_fixture_id INTEGER,
  playhq_gone_at TEXT,
  live_stream INTEGER NOT NULL DEFAULT 1 CHECK (live_stream IN (0, 1)),
  score_checked_at TEXT,
  no_video_auto_at TEXT,
  waiting_since TEXT,
  phase TEXT CHECK (phase IN ('grading1', 'crossover', 'grading2', 'championship'))
);
INSERT INTO games (id, team_id, starts_at, competition, round_label, opponent, venue, created_by, created_at, deleted_at, no_video_at,
  playhq_game_id, playhq_fixture_id, playhq_gone_at, live_stream, score_checked_at, no_video_auto_at, waiting_since, phase)
  SELECT id, team_id, starts_at, competition, round_label, opponent, venue, created_by, created_at, deleted_at, no_video_at,
  playhq_game_id, playhq_fixture_id, playhq_gone_at, live_stream, score_checked_at, no_video_auto_at, waiting_since, phase FROM games_backup;
DROP TABLE games_backup;
CREATE UNIQUE INDEX games_team_playhq ON games (team_id, playhq_game_id) WHERE playhq_game_id IS NOT NULL;
CREATE INDEX games_team_starts ON games (team_id, starts_at);

CREATE TABLE playhq_fixtures_backup AS SELECT * FROM playhq_fixtures;
DROP TABLE playhq_fixtures;
CREATE TABLE playhq_fixtures (
  id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  competition TEXT NOT NULL,
  playhq_team_id TEXT NOT NULL,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  auto_check INTEGER NOT NULL DEFAULT 1,
  game_count INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  no_video INTEGER NOT NULL DEFAULT 0
);
INSERT INTO playhq_fixtures (id, team_id, competition, playhq_team_id, url, name, auto_check, game_count, checked_at, last_error, created_at, no_video)
  SELECT id, team_id, competition, playhq_team_id, url, name, auto_check, game_count, checked_at, last_error, created_at, no_video FROM playhq_fixtures_backup;
DROP TABLE playhq_fixtures_backup;
CREATE UNIQUE INDEX playhq_fixtures_team ON playhq_fixtures (team_id, playhq_team_id);
