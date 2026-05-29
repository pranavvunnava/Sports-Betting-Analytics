"""
capture_closing.py — Capture closing-line odds for games starting within the next 2 hours.

Run this once every ~5-10 minutes as games approach tip-off/first-pitch/kickoff.
Each invocation appends rows to the closing_lines table with is_closing=1.
"""

import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY = os.getenv("ODDSPAPI_KEY")
if not API_KEY:
    sys.exit("Error: ODDSPAPI_KEY environment variable is not set.\nCopy .env.example to .env and add your key.")
BASE_URL = "https://api.the-odds-api.com/v4"

SPORTS = [
    "basketball_nba",
    "americanfootball_nfl",
    "baseball_mlb",
]

MARKETS = ["h2h", "spreads", "totals"]
REGIONS = "us"
CLOSING_WINDOW_HOURS = 2

DB_PATH = Path(__file__).parent / "betting.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    if SCHEMA_PATH.exists():
        conn.executescript(SCHEMA_PATH.read_text())
    else:
        conn.executescript("""
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
                is_closing  INTEGER NOT NULL DEFAULT 1
            );
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def fetch_odds_window(sport: str, client: httpx.Client, from_ts: str, to_ts: str) -> list[dict]:
    """Fetch odds for a sport filtered to games commencing in [from_ts, to_ts]."""
    resp = client.get(
        f"{BASE_URL}/sports/{sport}/odds",
        params={
            "apiKey": API_KEY,
            "regions": REGIONS,
            "markets": ",".join(MARKETS),
            "oddsFormat": "american",
            "dateFormat": "iso",
            "commenceTimeFrom": from_ts,
            "commenceTimeTo": to_ts,
        },
        timeout=20,
    )
    if resp.status_code == 401:
        sys.exit("OddsPapi: invalid or missing API key.")
    if resp.status_code == 422:
        return []
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Row extraction
# ---------------------------------------------------------------------------

def extract_rows(game: dict, sport: str, snapshot_ts: str) -> list[tuple]:
    """Flatten one game's bookmaker tree into closing_lines insert tuples."""
    rows = []
    game_id = game["id"]
    home = game["home_team"]
    away = game["away_team"]

    for bookmaker in game.get("bookmakers", []):
        book = bookmaker["key"]
        for market_obj in bookmaker.get("markets", []):
            market = market_obj["key"]
            for outcome in market_obj.get("outcomes", []):
                side = outcome["name"]
                if "point" in outcome:
                    side = f"{side} {outcome['point']:+g}"
                price = outcome["price"]
                rows.append((
                    game_id, home, away, sport,
                    book, market, side, price,
                    snapshot_ts,
                    1,  # is_closing
                ))
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=CLOSING_WINDOW_HOURS)

    # OddsPapi expects ISO-8601 without microseconds
    from_ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    to_ts = window_end.strftime("%Y-%m-%dT%H:%M:%SZ")
    snapshot_ts = now.isoformat()

    print(f"Capturing closing lines for games between {from_ts} and {to_ts}")

    conn = get_connection()
    ensure_schema(conn)

    total_rows = 0
    with httpx.Client() as client:
        for sport in SPORTS:
            print(f"  {sport} ...", end=" ", flush=True)
            try:
                games = fetch_odds_window(sport, client, from_ts, to_ts)
            except httpx.HTTPStatusError as exc:
                print(f"HTTP {exc.response.status_code} — skipping")
                continue

            rows = []
            for game in games:
                rows.extend(extract_rows(game, sport, snapshot_ts))

            if rows:
                conn.executemany(
                    """
                    INSERT INTO closing_lines
                        (game_id, home_team, away_team, sport, book, market,
                         side, odds, timestamp, is_closing)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )
                conn.commit()

            print(f"{len(games)} games closing soon, {len(rows)} rows inserted")
            total_rows += len(rows)

    conn.close()
    print(f"\nDone. {total_rows} closing-line rows written to {DB_PATH}")


if __name__ == "__main__":
    main()
