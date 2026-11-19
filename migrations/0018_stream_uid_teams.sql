-- Which team each Stream video, clip and live input was, kept when a team's rows are deleted (team-purge-repository.ts)
-- so Costs can still put a deleted team's minutes watched on it when it reads the month again. Goes with the team's
-- other Costs figures once nothing of the team is left. No team reference: the team's row can go first.
CREATE TABLE stream_uid_teams (
  uid TEXT PRIMARY KEY,
  team_id TEXT NOT NULL
);
