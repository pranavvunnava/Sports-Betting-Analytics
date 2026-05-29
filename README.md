# EdgeLab — Sports Betting Analytics

A full-stack sports betting analytics platform for identifying +EV opportunities, tracking closing line value, scanning arbitrage and middles, and managing bankroll performance.

## Features

- **EV Calculator** — devig any market across multiple books and calculate expected value against fair odds
- **Arbitrage Scanner** — detect guaranteed-profit opportunities across books with optimal stake calculator
- **Middle Finder** — identify spread/total windows where both sides of a bet can win simultaneously; includes hit probability model (normal distribution, σ=10) and break-even window bisection
- **Book Deduplication** — strips known copy-lines (e.g. SportsBettingAG mirrors BetOnline) and statistical duplicates so arb/EV signals aren't inflated by correlated books
- **Promotions Tracker** — model free-bet conversions, deposit bonuses, and no-sweat refunds to calculate guaranteed EV from sportsbook offers
- **CLV Tracker** — log bets with your odds, pull closing lines from the DB, and measure closing line value over time
- **Bankroll Dashboard** — bankroll curve, pending bet settlement, win rate, ROI, and biggest win/loss — all from localStorage
- **CLV Backtester** — join logged bets against captured closing lines to evaluate long-run edge; outputs CLV and ROI summaries to SQLite for longitudinal tracking
- **Alternate Line Scanner** — compare alternate spreads/totals against the devigged main-line fair price to find value on off-market lines

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, plain CSS-in-JS (no UI library), SVG charts |
| Odds engine | JavaScript (browser) + Python (data pipeline) |
| Data pipeline | Python 3.11+, httpx, SQLite (WAL mode) |
| API | OddsPapi (live odds + fixtures) |

## Project Structure

```
betting-system/
├── interface/          # React frontend (EV, Arb, Middles, Promos, Tracker, Dashboard)
│   └── src/
│       ├── engine.js   # All betting math: devig, EV, Kelly, arb, middles, alt lines
│       ├── ArbTab.js
│       ├── ModelTab.js
│       ├── PromotionsTab.js
│       ├── TrackerTab.js
│       └── DashboardTab.js
├── engine/             # Python betting math modules
│   ├── odds.py         # American ↔ decimal ↔ probability conversions
│   ├── devig.py        # Multiplicative and power devig
│   ├── ev.py           # EV% and CLV calculation
│   ├── arb.py          # Arbitrage detection and optimal stakes
│   ├── kelly.py        # Full and fractional Kelly criterion
│   ├── promotions.py   # Free-bet and bonus EV models
│   └── weights.py      # Book reliability weights
├── data/
│   ├── collect_odds.py     # Pulls live pregame odds → odds_snapshots table
│   ├── capture_closing.py  # Captures closing lines for games within 2 hours of start
│   └── schema.sql          # SQLite schema
├── backtester/
│   └── clv_backtester.py   # CLV and ROI backtest against closing_lines table
├── requirements.txt
└── .env.example
```

## Setup

### 1. Clone and configure environment

```bash
git clone https://github.com/your-username/betting-system.git
cd betting-system
cp .env.example .env
# Add your OddsPapi API key to .env
```

### 2. Install Python dependencies

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Initialize the database

```bash
python data/collect_odds.py
```

This creates `data/betting.db` and populates the first odds snapshot.

### 4. Run the frontend

```bash
cd interface
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### 5. (Optional) Schedule data collection

Run `data/collect_odds.py` on a cron/loop for continuous line movement tracking, and `data/capture_closing.py` every 5–10 minutes for CLV capture.

## Environment Variables

| Variable | Description |
|---|---|
| `ODDSPAPI_KEY` | Your OddsPapi API key (required) |

Copy `.env.example` to `.env` and fill in your key. Never commit `.env`.
