-- Stream's storage bought, as Costs saw it each month (the most it saw): a month that's over is priced by what was
-- bought then, a fixed charge however little was stored. Before a month has a record, the most Stream held at once.
CREATE TABLE stream_bought (
  month TEXT PRIMARY KEY,
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  seen_at TEXT NOT NULL
);

-- A sign-in code is pending until its email has gone: until then the code already in the inbox is the one that
-- works. Codes made before this column are sent (0).
ALTER TABLE sign_in_codes ADD COLUMN pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1));
