-- The currency Costs shows is the club's (CLUB.currency in src/club.ts), not one named by the schema: the saved exchange
-- rate's pair is 'USD/<its code>'. SQLite can't drop a CHECK, so the table is made again without it, its one row kept.
CREATE TABLE exchange_rates_backup AS SELECT * FROM exchange_rates;
DROP TABLE exchange_rates;
CREATE TABLE exchange_rates (
  pair TEXT PRIMARY KEY,
  rate REAL NOT NULL CHECK (rate > 0),
  rate_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
INSERT INTO exchange_rates (pair, rate, rate_date, fetched_at) SELECT pair, rate, rate_date, fetched_at FROM exchange_rates_backup;
DROP TABLE exchange_rates_backup;
