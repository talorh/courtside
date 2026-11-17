-- The photos added by time, so the daily limits on the photos a member and a team add count only the last day's rows
-- rather than every photo the team has. Only adds, so the code running now carries on as it is.
CREATE INDEX photos_team_added ON photos (team_id, created_at);
