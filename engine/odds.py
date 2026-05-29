def american_to_decimal(odds: float) -> float:
    """Convert American odds to decimal odds.

    Positive odds (underdog): stake $100 to win $odds, so decimal = (odds / 100) + 1
    Negative odds (favorite): stake $|odds| to win $100, so decimal = (100 / |odds|) + 1
    """
    if odds == 0:
        raise ValueError("Odds cannot be zero.")
    if odds > 0:
        return round((odds / 100) + 1, 4)
    else:
        return round((100 / abs(odds)) + 1, 4)


def decimal_to_american(decimal: float) -> float:
    """Convert decimal odds to American odds.

    Decimal >= 2 means the bet pays more than even money → positive American odds.
      american = (decimal - 1) * 100
    Decimal < 2 means the bet pays less than even money → negative American odds.
      american = -100 / (decimal - 1)
    """
    if decimal >= 2:
        return round((decimal - 1) * 100, 4)
    else:
        # decimal - 1 is the profit per unit staked; invert and negate for American format
        return round(-100 / (decimal - 1), 4)


def implied_probability(american_odds: float) -> float:
    """Convert American odds to the bookmaker's implied win probability (no-vig removed).

    Positive odds: the underdog formula — prob = 100 / (odds + 100)
    Negative odds: the favorite formula  — prob = |odds| / (|odds| + 100)

    Both formulas yield the fraction of the total payout that is your stake,
    which equals the break-even win rate at those odds.
    """
    if american_odds > 0:
        return round(100 / (american_odds + 100), 4)
    else:
        abs_odds = abs(american_odds)
        return round(abs_odds / (abs_odds + 100), 4)


def probability_to_american(probability: float) -> float:
    """Convert a win probability to fair-value American odds.

    probability >= 0.5 (favorite): odds are negative.
      american = -(probability / (1 - probability)) * 100
    probability < 0.5 (underdog): odds are positive.
      american = ((1 - probability) / probability) * 100

    These are the exact inverses of implied_probability().
    """
    if not 0 < probability < 1:
        raise ValueError(f"Probability must be between 0 and 1 exclusive, got {probability}.")
    if probability >= 0.5:
        return round(-(probability / (1 - probability)) * 100, 4)
    else:
        return round(((1 - probability) / probability) * 100, 4)
