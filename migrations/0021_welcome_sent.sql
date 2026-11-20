-- When a team's welcome email last went (admin/welcome-service.ts), so a second tap of Email it again within a minute
-- sends nothing more. Null until one goes, and again when one fails. Only adds a column.
ALTER TABLE teams ADD COLUMN welcome_sent_at TEXT;
