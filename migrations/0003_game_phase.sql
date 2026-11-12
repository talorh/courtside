-- The league season's phase a game is in (grading phase 1, the crossover game, grading phase 2, the season proper),
-- read from PlayHQ's grade name or set on the form; null for other competitions and games added before this.
ALTER TABLE games ADD COLUMN phase TEXT CHECK (phase IN ('grading1', 'crossover', 'grading2', 'championship'));
