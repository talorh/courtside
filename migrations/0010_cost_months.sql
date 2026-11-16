-- Each team's spent month on the admin area's Costs page, saved by the 3am job once the month has been over a week
-- (features/admin/costs-saved.ts), and read from then on in place of working it out again: so a video deleted later,
-- or a team deleted, changes nothing in the months already spent. Its dollars (US dollars, as Cloudflare bills: video
-- storage, watching, uploads to R2 and its share of the fixed costs), how much of the month Cloudflare's bill covered
-- (0 to 1, and its days), and its use (minutes stored, GB-months of originals, minutes watched). Figures only. The
-- dollars aren't held above zero: a credit on Cloudflare's bill can make one negative, and it's saved as billed.
CREATE TABLE cost_months (
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  team_id TEXT NOT NULL,
  storage REAL NOT NULL,
  viewing REAL NOT NULL,
  uploads REAL NOT NULL,
  shared REAL NOT NULL,
  billed REAL NOT NULL CHECK (billed BETWEEN 0 AND 1),
  billed_days INTEGER NOT NULL CHECK (billed_days >= 0),
  stored REAL NOT NULL CHECK (stored >= 0),
  gb_months REAL NOT NULL CHECK (gb_months >= 0),
  watched REAL NOT NULL CHECK (watched >= 0),
  saved_at TEXT NOT NULL,
  PRIMARY KEY (month, team_id)
);
