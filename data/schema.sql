-- Live odds snapshots collected on a recurring basis
CREATE TABLE IF NOT EXISTS odds_snapshots (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id   TEXT    NOT NULL,
    home_team TEXT    NOT NULL,
    away_team TEXT    NOT NULL,
    sport     TEXT    NOT NULL,  -- basketball_nba | americanfootball_nfl | baseball_mlb
    book      TEXT    NOT NULL,  -- bookmaker key, e.g. draftkings
    market    TEXT    NOT NULL,  -- h2h | spreads | totals
    side      TEXT    NOT NULL,  -- team name or Over/Under + point
    odds      REAL    NOT NULL,  -- American odds (e.g. -110, +150)
    timestamp TEXT    NOT NULL   -- ISO-8601 UTC of when snapshot was taken
);

CREATE INDEX IF NOT EXISTS idx_snapshots_game    ON odds_snapshots (game_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_sport   ON odds_snapshots (sport);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts      ON odds_snapshots (timestamp);

-- Closing-line snapshots: games commencing within 2 hours of capture time
CREATE TABLE IF NOT EXISTS closing_lines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     TEXT    NOT NULL,
    home_team   TEXT    NOT NULL,
    away_team   TEXT    NOT NULL,
    sport       TEXT    NOT NULL,
    book        TEXT    NOT NULL,
    market      TEXT    NOT NULL,
    side        TEXT    NOT NULL,
    odds        REAL    NOT NULL,
    timestamp   TEXT    NOT NULL,
    is_closing  INTEGER NOT NULL DEFAULT 1  -- always 1 in this table; stored for schema parity
);

CREATE INDEX IF NOT EXISTS idx_closing_game  ON closing_lines (game_id);
CREATE INDEX IF NOT EXISTS idx_closing_sport ON closing_lines (sport);
CREATE INDEX IF NOT EXISTS idx_closing_ts    ON closing_lines (timestamp);

-- Individual bet records with full model metadata and settlement
CREATE TABLE IF NOT EXISTS bets (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    date              TEXT    NOT NULL,
    sport             TEXT    NOT NULL,
    market            TEXT    NOT NULL,
    book              TEXT    NOT NULL,
    team              TEXT    NOT NULL,
    odds              REAL    NOT NULL,
    stake             REAL    NOT NULL,
    fair_odds         REAL,
    ev_pct            REAL,
    kelly_recommended REAL,
    promo_used        INTEGER DEFAULT 0,
    promo_type        TEXT,
    result            TEXT    CHECK (result IN ('win', 'loss', 'push', 'pending')),
    profit_loss       REAL,
    clv               REAL,
    notes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_bets_date   ON bets (date);
CREATE INDEX IF NOT EXISTS idx_bets_sport  ON bets (sport);
CREATE INDEX IF NOT EXISTS idx_bets_result ON bets (result);

-- Backtest run summaries
CREATE TABLE IF NOT EXISTS backtest_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date    TEXT    NOT NULL,
    sport       TEXT,
    market      TEXT,
    date_from   TEXT,
    date_to     TEXT,
    sample_size INTEGER,
    roi_pct     REAL,
    clv_avg     REAL,
    win_rate    REAL,
    weights_used TEXT,
    notes       TEXT
);

-- Per-book weight accuracy tracking: did our weighting predict the closing line?
CREATE TABLE IF NOT EXISTS book_weight_performance (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    date                TEXT    NOT NULL,
    sport               TEXT    NOT NULL,
    market              TEXT    NOT NULL,
    book                TEXT    NOT NULL,
    weight_used         REAL,
    predicted_fair_odds REAL,
    actual_closing_odds REAL,
    accuracy_pct        REAL
);

-- Sportsbook promotions log
CREATE TABLE IF NOT EXISTS promotions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    book          TEXT    NOT NULL,
    promo_type    TEXT    NOT NULL,
    value         REAL,
    description   TEXT,
    expiry_date   TEXT,
    claimed       INTEGER DEFAULT 0,
    claimed_date  TEXT,
    used_on_bet_id INTEGER REFERENCES bets (id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_book    ON promotions (book);
CREATE INDEX IF NOT EXISTS idx_promotions_claimed ON promotions (claimed);

-- Sportsbook account health tracker
CREATE TABLE IF NOT EXISTS account_health (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    book           TEXT    NOT NULL UNIQUE,
    max_bet_limit  REAL,
    status         TEXT    DEFAULT 'active' CHECK (status IN ('active', 'limited', 'banned')),
    account_opened TEXT,
    total_bets     INTEGER DEFAULT 0,
    total_profit   REAL    DEFAULT 0,
    notes          TEXT,
    last_updated   TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_health_book ON account_health (book);
