from engine.odds import american_to_decimal, implied_probability


def detect_arbitrage(odds_list: list[float]) -> dict:
    """Check whether a set of odds across books contains an arbitrage opportunity.

    odds_list – one American odds value per outcome (e.g. [-135, +138])

    implied_sum < 1.0 means the combined implied probabilities don't cover the full
    probability space — a guaranteed profit exists regardless of outcome.

    Returns:
      is_arb       – True if arbitrage exists
      implied_sum  – sum of all implied probabilities (< 1.0 means arb)
      profit_pct   – guaranteed profit as % of bankroll wagered (0 if no arb)
      margin       – (implied_sum - 1) × 100; negative when arb exists, positive otherwise
    """
    probs = [implied_probability(o) for o in odds_list]
    implied_sum = round(sum(probs), 6)
    is_arb = implied_sum < 1.0
    profit_pct = round((1 / implied_sum - 1) * 100, 4) if is_arb else 0
    margin = round((implied_sum - 1) * 100, 4)

    return {
        "is_arb":      is_arb,
        "implied_sum": implied_sum,
        "profit_pct":  profit_pct,
        "margin":      margin,
    }


def optimal_stakes(odds_list: list[float], bankroll: float) -> list[float]:
    """Calculate exact bet sizes for equal payout regardless of which outcome wins.

    Derivation:
      We want stake_i × decimal_i = P (same payout P) for all i.
      stake_i = P / decimal_i
      sum(stake_i) = bankroll  →  P = bankroll / sum(1 / decimal_i)
      stake_i = bankroll / (decimal_i × sum(1 / decimal_i))

    Returns a list of dollar amounts parallel to odds_list.
    """
    decimals = [american_to_decimal(o) for o in odds_list]
    inv_sum = sum(1 / d for d in decimals)
    return [round(bankroll / (d * inv_sum), 2) for d in decimals]


def arb_summary(books: list[str], odds_list: list[float], bankroll: float) -> dict:
    """Full arbitrage report combining detection, stakes, and expected payout.

    books     – book name for each outcome, parallel to odds_list
    odds_list – American odds for each outcome
    bankroll  – total amount to spread across all sides

    Returns a dict with:
      detection   – output of detect_arbitrage()
      legs        – per-side breakdown (book, odds, stake, implied_prob)
      payout      – guaranteed return in dollars (same for every outcome)
      profit      – payout minus bankroll
    """
    detection = detect_arbitrage(odds_list)
    stakes = optimal_stakes(odds_list, bankroll)
    decimals = [american_to_decimal(o) for o in odds_list]

    # Payout is the same whichever leg wins; use the first leg to compute it
    payout = round(stakes[0] * decimals[0], 2)
    profit = round(payout - bankroll, 2)

    legs = [
        {
            "book":         book,
            "odds":         f"{odds:+}",
            "stake":        stake,
            "implied_prob": round(implied_probability(odds), 4),
        }
        for book, odds, stake in zip(books, odds_list, stakes)
    ]

    return {
        "detection": detection,
        "legs":      legs,
        "payout":    payout,
        "profit":    profit,
    }


if __name__ == "__main__":
    # Video example: Rebet Moutet -135 vs Novig Djokovic +138
    books     = ["Rebet",  "Novig"]
    odds_list = [-135,      138]
    bankroll  = 1000

    summary = arb_summary(books, odds_list, bankroll)

    det = summary["detection"]
    print(f"=== Arbitrage Detection ===")
    print(f"  is_arb      : {det['is_arb']}")
    print(f"  implied_sum : {det['implied_sum']}")
    print(f"  profit_pct  : {det['profit_pct']}%")
    print(f"  margin      : {det['margin']}%")

    print(f"\n=== Legs (bankroll=${bankroll:,}) ===")
    for leg in summary["legs"]:
        print(f"  {leg['book']:10} {leg['odds']:>6}  →  stake ${leg['stake']:.2f}  (impl. prob {leg['implied_prob']})")

    print(f"\n=== Result ===")
    print(f"  guaranteed payout : ${summary['payout']:.2f}")
    print(f"  guaranteed profit : ${summary['profit']:.2f}")
