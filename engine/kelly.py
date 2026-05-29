from engine.odds import american_to_decimal, implied_probability


def kelly_fraction(
    fair_odds: float,
    target_odds: float,
    bankroll: float,
    kelly_multiplier: float = 0.5,
) -> dict:
    """Calculate the Kelly-optimal bet size for a given edge.

    fair_odds       – devigged fair-value American odds (from devig.py)
    target_odds     – American odds being offered by the sportsbook
    bankroll        – total bankroll in dollars
    kelly_multiplier – fraction of full Kelly to use; 0.5 = half Kelly (default)

    Full Kelly formula:
      f* = (p × d - 1) / (d - 1)

    where p = win probability, d = target decimal odds.
    This is algebraically equivalent to the classic (bp - q) / b form
    where b = d - 1 (net profit per unit) and q = 1 - p (loss probability).

    Half Kelly (kelly_multiplier=0.5) is standard practice — it cuts variance
    roughly in half while sacrificing only a small amount of long-run growth.
    """
    win_probability = implied_probability(fair_odds)
    target_decimal = american_to_decimal(target_odds)
    net_odds = target_decimal - 1  # profit per unit staked on a win

    full_kelly_pct = (win_probability * target_decimal - 1) / net_odds
    adjusted_kelly_pct = full_kelly_pct * kelly_multiplier
    recommended_bet = adjusted_kelly_pct * bankroll

    return {
        "win_probability":  round(win_probability, 4),
        "full_kelly_pct":   round(full_kelly_pct, 4),
        "half_kelly_pct":   round(adjusted_kelly_pct, 4),
        "recommended_bet":  round(recommended_bet, 2),
    }


def apply_multipliers(
    base_bet: float,
    all_books_plus_ev: bool = False,
    liquid_market: bool = False,
    market_crossed: bool = False,
    soft_book: bool = False,
    tight_market: bool = False,
) -> float:
    """Scale a base Kelly bet by confidence multipliers.

    Each flag that is True compounds the bet size by its multiplier:
      all_books_plus_ev  – every book in the market is showing +EV        → ×2.00
      liquid_market      – high-volume market with sharp, reliable odds    → ×1.50
      market_crossed     – line has crossed (arbitrage signal)             → ×1.50
      soft_book          – target book is recreational-facing (soft limit) → ×1.25
      tight_market       – spread/total market is tight (sharp signal)     → ×1.25

    Multipliers compound: a bet that qualifies for two 1.5× conditions
    becomes base × 1.5 × 1.5 = base × 2.25.
    """
    multiplier = 1.0
    if all_books_plus_ev:
        multiplier *= 2.00
    if liquid_market:
        multiplier *= 1.50
    if market_crossed:
        multiplier *= 1.50
    if soft_book:
        multiplier *= 1.25
    if tight_market:
        multiplier *= 1.25
    return round(base_bet * multiplier, 2)


if __name__ == "__main__":
    FAIR_ODDS   = -133
    TARGET_ODDS = -128
    BANKROLL    = 10_000

    result = kelly_fraction(FAIR_ODDS, TARGET_ODDS, BANKROLL)
    print(f"=== kelly_fraction(fair={FAIR_ODDS}, target={TARGET_ODDS}, bankroll=${BANKROLL:,}) ===")
    print(f"  win_probability : {result['win_probability']}")
    print(f"  full_kelly_pct  : {result['full_kelly_pct']:.4%}")
    print(f"  half_kelly_pct  : {result['half_kelly_pct']:.4%}")
    print(f"  recommended_bet : ${result['recommended_bet']:.2f}")

    base = result["recommended_bet"]

    no_mult = apply_multipliers(base)
    all_mult = apply_multipliers(
        base,
        all_books_plus_ev=True,
        liquid_market=True,
        market_crossed=True,
        soft_book=True,
        tight_market=True,
    )
    print(f"\n=== apply_multipliers (base=${base:.2f}) ===")
    print(f"  all multipliers False : ${no_mult:.2f}")
    print(f"  all multipliers True  : ${all_mult:.2f}  (×{all_mult/base:.4f})")
