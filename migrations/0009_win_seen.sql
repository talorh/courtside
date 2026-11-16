-- The win pop-up on a game's page shows once per member per game: the first time they open a won game that's ready to
-- watch. A row here says they've had it.
CREATE TABLE win_seen (
  team_id TEXT NOT NULL REFERENCES teams(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  seen_at TEXT NOT NULL,
  PRIMARY KEY (team_id, game_id, member_id)
);
