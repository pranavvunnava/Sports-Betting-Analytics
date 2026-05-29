"""
collect_odds.py — Pull live pregame odds for NBA, NFL, and MLB from the OddsPapi API
and persist every snapshot row into data/betting.db (odds_snapshots table).

Run on whatever cadence you want (cron, loop, etc.). Each call appends a fresh
snapshot; rows are never updated or deleted so you can track line movement over time.

OddsPapi flow:
  1. GET /fixtures?apiKey=…&sportId=…&status=prematch  → list of upcoming fixtures
  2. GET /odds?apiKey=…&fixtureId=…                   → bookmakerOdds for that fixture
"""

import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY = os.getenv("ODDSPAPI_KEY")
if not API_KEY:
    sys.exit("Error: ODDSPAPI_KEY environment variable is not set.\nCopy .env.example to .env and add your key.")
BASE_URL = "https://api.oddspapi.io/v4"

# Maps the human-readable sport name (stored in the DB) to its OddsPapi sportId
SPORTS: dict[str, int] = {
    "basketball_nba":       11,
    "baseball_mlb":         13,
    "americanfootball_nfl": 14,
}

MAX_FIXTURES_PER_SPORT = 20

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
        # Inline fallback so the script works without schema.sql present
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS odds_snapshots (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id   TEXT NOT NULL,
                home_team TEXT NOT NULL,
                away_team TEXT NOT NULL,
                sport     TEXT NOT NULL,
                book      TEXT NOT NULL,
                market    TEXT NOT NULL,
                side      TEXT NOT NULL,
                odds      REAL NOT NULL,
                timestamp TEXT NOT NULL
            );
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _get_with_retry(client: httpx.Client, url: str, params: dict) -> httpx.Response:
    """GET url, retrying automatically on 429 using the retryMs field in the response."""
    while True:
        resp = client.get(url, params=params, timeout=20)
        if resp.status_code == 429:
            try:
                retry_ms = resp.json().get("retryMs", 1000)
            except Exception:
                retry_ms = 1000
            wait_s = retry_ms / 1000
            print(f"  rate limited — waiting {wait_s:.3f}s (retryMs={retry_ms})")
            time.sleep(wait_s)
            continue
        if resp.status_code == 401:
            sys.exit(f"OddsPapi: invalid or missing API key.\n{resp.text}")
        return resp


def _league_name(fixture: dict) -> str:
    """Return the league/tournament name from a fixture, however the API spells the field."""
    for key in ("leagueName", "tournamentName", "league", "tournament", "competition", "competitionName"):
        val = fixture.get(key)
        if isinstance(val, str):
            return val
        if isinstance(val, dict):
            return val.get("name", "")
    return ""


def fetch_fixtures(sport_id: int, client: httpx.Client) -> list[dict]:
    """Return prematch fixtures for a sport from /fixtures."""
    today = datetime.now(timezone.utc).date()
    resp = _get_with_retry(
        client,
        f"{BASE_URL}/fixtures",
        {
            "apiKey":   API_KEY,
            "sportId":  sport_id,
            "status":   "prematch",
            "from":     today.strftime("%Y-%m-%d"),
            "to":       (today + timedelta(days=2)).strftime("%Y-%m-%d"),
        },
    )
    if resp.status_code in (404, 422):
        return []
    resp.raise_for_status()
    data = resp.json()
    # API may return {"data": [...]} or a bare list
    fixtures = data.get("data", data) if isinstance(data, dict) else data
    print(f"  {len(fixtures)} fixtures before filtering")
    if sport_id == 11:  # basketball
        fixtures = [f for f in fixtures if "NBA" in _league_name(f)]
        print(f"  {len(fixtures)} fixtures after NBA filter")
    elif sport_id == 13:  # baseball
        fixtures = [f for f in fixtures if "MLB" in _league_name(f) or "Major League Baseball" in _league_name(f)]
        print(f"  {len(fixtures)} fixtures after MLB filter")
    elif sport_id == 14:  # american football
        fixtures = [f for f in fixtures if "NFL" in _league_name(f)]
        print(f"  {len(fixtures)} fixtures after NFL filter")
    if len(fixtures) > MAX_FIXTURES_PER_SPORT:
        print(f"  capping at {MAX_FIXTURES_PER_SPORT} (was {len(fixtures)})")
        fixtures = fixtures[:MAX_FIXTURES_PER_SPORT]
    return fixtures


def fetch_fixture_odds(fixture_id: str | int, client: httpx.Client) -> dict:
    """Return the odds payload for a single fixture from /odds."""
    resp = _get_with_retry(
        client,
        f"{BASE_URL}/odds",
        {"apiKey": API_KEY, "fixtureId": fixture_id},
    )
    if resp.status_code in (404, 422):
        return {}
    resp.raise_for_status()
    data = resp.json()
    return data.get("data", data) if isinstance(data, dict) else data


# ---------------------------------------------------------------------------
# Row extraction
# ---------------------------------------------------------------------------

def _side_label(key: str, line: float | None, home: str, away: str) -> str:
    """Convert an outcome key + optional line into a human-readable side string."""
    mapping = {"home": home, "away": away, "over": "Over", "under": "Under", "draw": "Draw"}
    label = mapping.get(key.lower(), key)
    if line is not None:
        label = f"{label} {line:+g}"
    return label


def extract_rows(fixture: dict, odds_data: dict, sport: str, snapshot_ts: str) -> list[tuple]:
    """Flatten one fixture's bookmakerOdds tree into insert-ready tuples.

    bookmakerOdds shape (per OddsPapi docs):
      { "<book_slug>": { "<market>": { "<side_key>": <price>|{"line":…,"price":…} } } }
    """
    rows = []
    game_id = str(fixture.get("id") or fixture.get("fixtureId", ""))
    home = fixture.get("homeTeam") or fixture.get("home_team", "")
    away = fixture.get("awayTeam") or fixture.get("away_team", "")

    bookmaker_odds: dict = odds_data.get("bookmakerOdds", {})

    for book, markets in bookmaker_odds.items():
        if not isinstance(markets, dict):
            continue
        for market, outcomes in markets.items():
            if not isinstance(outcomes, dict):
                continue
            for side_key, value in outcomes.items():
                if value is None:
                    continue
                # value is either a plain price (int/float) or {"line": …, "price": …}
                if isinstance(value, (int, float)):
                    price, line = float(value), None
                elif isinstance(value, dict):
                    price = float(value.get("price", 0) or 0)
                    line = value.get("line")
                else:
                    continue
                side = _side_label(side_key, line, home, away)
                rows.append((game_id, home, away, sport, book, market, side, price, snapshot_ts))

    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("Script started")
    snapshot_ts = datetime.now(timezone.utc).isoformat()

    conn = get_connection()
    ensure_schema(conn)

    total_rows = 0

    with httpx.Client() as client:
        for sport, sport_id in SPORTS.items():
            print(f"Fetching {sport} (id={sport_id}) ...")
            try:
                fixtures = fetch_fixtures(sport_id, client)
            except httpx.HTTPStatusError as exc:
                print(f"  /fixtures HTTP {exc.response.status_code} — skipping sport\n{exc.response.text}")
                continue

            print(f"  {len(fixtures)} prematch fixtures found")
            sport_rows = 0

            for fixture in fixtures:
                fid = fixture.get("id") or fixture.get("fixtureId")
                try:
                    odds_data = fetch_fixture_odds(fid, client)
                except httpx.HTTPStatusError as exc:
                    print(f"  fixture {fid}: HTTP {exc.response.status_code} — skipping\n{exc.response.text}")
                    continue

                rows = extract_rows(fixture, odds_data, sport, snapshot_ts)
                if rows:
                    conn.executemany(
                        """
                        INSERT INTO odds_snapshots
                            (game_id, home_team, away_team, sport, book, market, side, odds, timestamp)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        rows,
                    )
                    conn.commit()
                    sport_rows += len(rows)

            print(f"  {sport_rows} rows inserted")
            total_rows += sport_rows

    conn.close()
    print(f"\nDone. {total_rows} total rows written to {DB_PATH}")


if __name__ == "__main__":
    main()
