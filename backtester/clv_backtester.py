"""
clv_backtester.py — Evaluate betting performance using closing line value and ROI.

CLV backtest: joins bets against closing_lines to measure how well we beat the
closing price — the sharpest signal of true fair value.

ROI backtest: reads settled bets and calculates raw profitability.

Both save a summary row to backtest_runs for longitudinal tracking.
"""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "betting.db"


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _where_clauses(sport, market, date_from, date_to, table_alias="b") -> tuple[list, list]:
    """Build WHERE fragments and params for common filter args."""
    clauses, params = [], []
    if sport:
        clauses.append(f"{table_alias}.sport = ?")
        params.append(sport)
    if market:
        clauses.append(f"{table_alias}.market = ?")
        params.append(market)
    if date_from:
        clauses.append(f"{table_alias}.date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append(f"{table_alias}.date <= ?")
        params.append(date_to)
    return clauses, params


def _save_backtest_run(conn: sqlite3.Connection, row: dict) -> None:
    conn.execute(
        """
        INSERT INTO backtest_runs
            (run_date, sport, market, date_from, date_to, sample_size,
             roi_pct, clv_avg, win_rate, weights_used, notes)
        VALUES (:run_date, :sport, :market, :date_from, :date_to, :sample_size,
                :roi_pct, :clv_avg, :win_rate, :weights_used, :notes)
        """,
        row,
    )
    conn.commit()


# ---------------------------------------------------------------------------
# CLV backtest
# ---------------------------------------------------------------------------

def run_clv_backtest(
    sport: str = None,
    market: str = None,
    date_from: str = None,
    date_to: str = None,
) -> dict:
    """Join bets against closing_lines and measure closing line value.

    Matches each bet to the latest closing-line snapshot for the same
    sport + market + team/side combination. CLV is bet_odds - closing_odds:
    positive means we got a better price than where the line closed.
    """
    conn = _connect()

    clauses, params = _where_clauses(sport, market, date_from, date_to)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    # Latest closing odds per sport/market/side
    rows = conn.execute(
        f"""
        SELECT
            b.id,
            b.date,
            b.sport,
            b.market,
            b.book,
            b.team,
            b.odds       AS bet_odds,
            b.stake,
            b.profit_loss,
            cl.odds      AS closing_odds,
            (b.odds - cl.odds) AS clv
        FROM bets b
        JOIN (
            SELECT sport, market, side,
                   odds,
                   ROW_NUMBER() OVER (
                       PARTITION BY sport, market, side
                       ORDER BY timestamp DESC
                   ) AS rn
            FROM closing_lines
        ) cl
          ON  b.sport  = cl.sport
          AND b.market = cl.market
          AND b.team   = cl.side
          AND cl.rn    = 1
        {where}
        """,
        params,
    ).fetchall()

    if not rows:
        summary = {
            "total_bets": 0,
            "bets_beat_closing_line": 0,
            "clv_rate": 0.0,
            "average_clv": 0.0,
            "total_profit_loss": 0.0,
            "roi_pct": 0.0,
            "best_bet": None,
            "worst_bet": None,
        }
        _print_clv_report(summary, sport, market, date_from, date_to)
        conn.close()
        return summary

    total_bets          = len(rows)
    bets_beat_cl        = sum(1 for r in rows if r["clv"] > 0)
    clv_rate            = round(bets_beat_cl / total_bets * 100, 4)
    average_clv         = round(sum(r["clv"] for r in rows) / total_bets, 4)
    total_profit_loss   = round(sum(r["profit_loss"] or 0 for r in rows), 2)
    total_staked        = sum(r["stake"] for r in rows)
    roi_pct             = round(total_profit_loss / total_staked * 100, 4) if total_staked else 0.0

    best  = max(rows, key=lambda r: r["clv"])
    worst = min(rows, key=lambda r: r["clv"])

    def _bet_label(r):
        return {
            "id":           r["id"],
            "date":         r["date"],
            "team":         r["team"],
            "book":         r["book"],
            "bet_odds":     r["bet_odds"],
            "closing_odds": r["closing_odds"],
            "clv":          round(r["clv"], 2),
        }

    summary = {
        "total_bets":             total_bets,
        "bets_beat_closing_line": bets_beat_cl,
        "clv_rate":               clv_rate,
        "average_clv":            average_clv,
        "total_profit_loss":      total_profit_loss,
        "roi_pct":                roi_pct,
        "best_bet":               _bet_label(best),
        "worst_bet":              _bet_label(worst),
    }

    _save_backtest_run(conn, {
        "run_date":    datetime.now(timezone.utc).isoformat(),
        "sport":       sport,
        "market":      market,
        "date_from":   date_from,
        "date_to":     date_to,
        "sample_size": total_bets,
        "roi_pct":     roi_pct,
        "clv_avg":     average_clv,
        "win_rate":    None,
        "weights_used": None,
        "notes":       "clv_backtest",
    })

    _print_clv_report(summary, sport, market, date_from, date_to)
    conn.close()
    return summary


def _print_clv_report(s: dict, sport, market, date_from, date_to) -> None:
    filters = " | ".join(filter(None, [sport, market, date_from and f"from {date_from}", date_to and f"to {date_to}"]))
    print(f"\n{'='*50}")
    print(f"  CLV BACKTEST{('  [' + filters + ']') if filters else ''}")
    print(f"{'='*50}")
    if s["total_bets"] == 0:
        print("  No matching bets with closing line data.")
        return
    print(f"  Total bets          : {s['total_bets']}")
    print(f"  Beat closing line   : {s['bets_beat_closing_line']}  ({s['clv_rate']}%)")
    print(f"  Average CLV         : {s['average_clv']:+.2f} cents")
    print(f"  Total P&L           : ${s['total_profit_loss']:,.2f}")
    print(f"  ROI                 : {s['roi_pct']:+.2f}%")
    if s["best_bet"]:
        b = s["best_bet"]
        print(f"  Best  CLV           : {b['clv']:+.1f}c  {b['team']} @ {b['book']}  ({b['bet_odds']:+} vs close {b['closing_odds']:+})")
    if s["worst_bet"]:
        w = s["worst_bet"]
        print(f"  Worst CLV           : {w['clv']:+.1f}c  {w['team']} @ {w['book']}  ({w['bet_odds']:+} vs close {w['closing_odds']:+})")
    print(f"{'='*50}\n")


# ---------------------------------------------------------------------------
# ROI backtest
# ---------------------------------------------------------------------------

def run_roi_backtest(sport: str = None, market: str = None) -> dict:
    """Calculate raw ROI from all settled bets (win / loss / push).

    profit_loss is stored per-bet (positive for wins, negative for losses, 0 for push).
    total_returned = total_staked + total_profit_loss
    """
    conn = _connect()

    clauses = ["b.result IN ('win', 'loss', 'push')"]
    params: list = []
    extra_clauses, extra_params = _where_clauses(sport, market, None, None)
    clauses.extend(extra_clauses)
    params.extend(extra_params)
    where = "WHERE " + " AND ".join(clauses)

    rows = conn.execute(
        f"""
        SELECT b.result, b.stake, b.profit_loss, b.sport, b.market
        FROM bets b
        {where}
        """,
        params,
    ).fetchall()

    if not rows:
        summary = {
            "total_bets": 0,
            "total_staked": 0.0,
            "total_returned": 0.0,
            "total_profit": 0.0,
            "roi_pct": 0.0,
            "win_rate": 0.0,
            "wins": 0,
            "losses": 0,
            "pushes": 0,
        }
        _print_roi_report(summary, sport, market)
        conn.close()
        return summary

    wins   = sum(1 for r in rows if r["result"] == "win")
    losses = sum(1 for r in rows if r["result"] == "loss")
    pushes = sum(1 for r in rows if r["result"] == "push")

    total_staked   = round(sum(r["stake"] for r in rows), 2)
    total_profit   = round(sum(r["profit_loss"] or 0 for r in rows), 2)
    total_returned = round(total_staked + total_profit, 2)
    roi_pct        = round(total_profit / total_staked * 100, 4) if total_staked else 0.0
    win_rate       = round(wins / (wins + losses) * 100, 4) if (wins + losses) else 0.0

    summary = {
        "total_bets":    len(rows),
        "total_staked":  total_staked,
        "total_returned": total_returned,
        "total_profit":  total_profit,
        "roi_pct":       roi_pct,
        "win_rate":      win_rate,
        "wins":          wins,
        "losses":        losses,
        "pushes":        pushes,
    }

    _save_backtest_run(conn, {
        "run_date":     datetime.now(timezone.utc).isoformat(),
        "sport":        sport,
        "market":       market,
        "date_from":    None,
        "date_to":      None,
        "sample_size":  len(rows),
        "roi_pct":      roi_pct,
        "clv_avg":      None,
        "win_rate":     win_rate,
        "weights_used": None,
        "notes":        "roi_backtest",
    })

    _print_roi_report(summary, sport, market)
    conn.close()
    return summary


def _print_roi_report(s: dict, sport, market) -> None:
    filters = " | ".join(filter(None, [sport, market]))
    print(f"\n{'='*50}")
    print(f"  ROI BACKTEST{('  [' + filters + ']') if filters else ''}")
    print(f"{'='*50}")
    if s["total_bets"] == 0:
        print("  No settled bets found.")
    else:
        print(f"  Total bets          : {s['total_bets']}  (W{s['wins']} / L{s['losses']} / P{s['pushes']})")
        print(f"  Win rate            : {s['win_rate']:.2f}%")
        print(f"  Total staked        : ${s['total_staked']:,.2f}")
        print(f"  Total returned      : ${s['total_returned']:,.2f}")
        print(f"  Profit / Loss       : ${s['total_profit']:,.2f}")
        print(f"  ROI                 : {s['roi_pct']:+.2f}%")
    print(f"{'='*50}\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Running CLV backtest (all sports, all markets)...")
    run_clv_backtest()

    print("Running ROI backtest (all sports, all markets)...")
    run_roi_backtest()
