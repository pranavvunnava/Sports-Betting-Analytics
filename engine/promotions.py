from engine.odds import american_to_decimal, decimal_to_american, implied_probability
from engine.ev import calculate_ev
from engine.kelly import kelly_fraction


def apply_promotion(base_odds: float, promo_type: str, promo_value: float) -> float:
    """Return the effective American odds after applying a sportsbook promotion.

    promo_type / promo_value:

      profit_boost  – promo_value is the boost fraction (e.g. 1.0 = 100% boost).
                      Winnings are multiplied by (1 + promo_value); stake still returned.
                      boosted_decimal = 1 + (decimal - 1) × (1 + promo_value)

      odds_boost    – promo_value is the number of American-odds cents to add directly.
                      e.g. base +150, promo_value 20 → effective +170.

      free_bet      – stake is not returned on a win; only profit is paid out.
                      effective_decimal = decimal - 1  (removes the stake-return component)
                      promo_value is unused — the promotion itself is the free token.
    """
    decimal = american_to_decimal(base_odds)

    if promo_type == "profit_boost":
        boosted_decimal = 1 + (decimal - 1) * (1 + promo_value)
        return round(decimal_to_american(boosted_decimal), 4)

    elif promo_type == "odds_boost":
        return round(base_odds + promo_value, 4)

    elif promo_type == "free_bet":
        # Only the profit is returned — strip the stake from the decimal
        effective_decimal = decimal - 1
        return round(decimal_to_american(effective_decimal), 4)

    else:
        raise ValueError(f"Unknown promo_type '{promo_type}'. Use: profit_boost, odds_boost, free_bet.")


def promo_ev(
    fair_odds: float,
    base_odds: float,
    promo_type: str,
    promo_value: float,
    bankroll: float,
) -> dict:
    """EV and Kelly sizing with a promotion applied.

    For profit_boost and odds_boost the promotion is baked into the effective odds,
    so standard EV and Kelly formulas apply against the fair price.

    For free_bet there is no downside (no real stake at risk), so:
      EV% = win_probability × (base_decimal - 1) × 100  (profit only, no loss term)
      Kelly is skipped in favour of using the full free-bet face value.
    """
    effective_odds = apply_promotion(base_odds, promo_type, promo_value)

    if promo_type == "free_bet":
        win_prob = implied_probability(fair_odds)
        base_decimal = american_to_decimal(base_odds)
        ev_pct = round(win_prob * (base_decimal - 1) * 100, 4)
        return {
            "promo_type":      promo_type,
            "base_odds":       f"{base_odds:+}",
            "effective_odds":  f"{effective_odds:+}",
            "ev_pct":          ev_pct,
            "recommended_bet": bankroll,  # no real money at risk — use the full token
            "note":            "Free bet: stake not returned. Bet full token amount.",
        }

    ev_pct = calculate_ev(fair_odds, effective_odds)
    kelly = kelly_fraction(fair_odds, effective_odds, bankroll)

    return {
        "promo_type":      promo_type,
        "base_odds":       f"{base_odds:+}",
        "effective_odds":  f"{effective_odds:+}",
        "ev_pct":          ev_pct,
        "win_probability": kelly["win_probability"],
        "full_kelly_pct":  kelly["full_kelly_pct"],
        "half_kelly_pct":  kelly["half_kelly_pct"],
        "recommended_bet": kelly["recommended_bet"],
    }


if __name__ == "__main__":
    # Caesars 100% profit boost on Lakers +150, fair value +140, $10k bankroll
    result = promo_ev(
        fair_odds=140,
        base_odds=150,
        promo_type="profit_boost",
        promo_value=1.0,
        bankroll=10_000,
    )

    effective = apply_promotion(150, "profit_boost", 1.0)
    print(f"=== Caesars 100% Profit Boost — Lakers +150 ===")
    print(f"  base odds       : {result['base_odds']}")
    print(f"  effective odds  : {result['effective_odds']}  (+150 boosted 100% → {effective:+.0f})")
    print(f"  win probability : {result['win_probability']}")
    print(f"  EV              : {result['ev_pct']:+.4f}%")
    print(f"  full Kelly      : {result['full_kelly_pct']:.4%}")
    print(f"  half Kelly      : {result['half_kelly_pct']:.4%}")
    print(f"  recommended bet : ${result['recommended_bet']:,.2f}")
