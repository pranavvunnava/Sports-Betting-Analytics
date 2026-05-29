from engine.odds import american_to_decimal, implied_probability


def calculate_ev(fair_odds: float, target_odds: float) -> float:
    """Expected value of a bet as a percentage of stake.

    fair_odds   – the true fair-value American odds from our devigged model
    target_odds – the American odds actually being offered by the sportsbook

    Formula:
      fair_prob    = implied_probability(fair_odds)
      target_dec   = american_to_decimal(target_odds)
      EV%          = (fair_prob * target_dec - 1) * 100

    fair_prob * target_dec is the expected return per dollar wagered (winnings + stake
    returned). Subtracting 1 removes the stake, leaving pure expected profit per dollar.
    A positive result means the book is offering more than the fair price — bet it.
    A negative result means the book is short — pass.
    """
    fair_prob = implied_probability(fair_odds)
    target_decimal = american_to_decimal(target_odds)
    ev = (fair_prob * target_decimal - 1) * 100
    return round(ev, 4)


def calculate_clv(bet_odds: float, closing_odds: float) -> float:
    """Closing line value — how many cents better your odds were than the closing line.

    bet_odds     – the American odds you actually got when placing the bet
    closing_odds – the American odds at market close (the sharpest price signal)

    CLV is simply the difference in American odds: bet_odds - closing_odds.
    Positive means you beat the closing line (you got a better number).
    Negative means the line moved against you after you bet.

    Examples:
      bet +136, close +128 → CLV = +8   (you got 8 cents the best of it)
      bet -130, close -125 → CLV = -5   (line moved in your favour but you paid more)
    """
    return round(bet_odds - closing_odds, 4)


if __name__ == "__main__":
    # EV test: fair -133, FanDuel offering -128
    ev = calculate_ev(-133, -128)
    print(f"EV: fair -133 vs FanDuel -128 → {ev:+.4f}%")

    # CLV test: bet +136, closed +128
    clv = calculate_clv(136, 128)
    print(f"CLV: bet +136, closed +128 → {clv:+.1f} cents")
