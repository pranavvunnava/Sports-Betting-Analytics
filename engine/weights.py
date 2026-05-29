_MAINLINE = {"pinnacle": 35, "circa": 25, "betonline": 20, "fanduel": 10, "draftkings": 10}
_PROPS    = {"fanduel": 30, "draftkings": 30, "pinnacle": 15, "betonline": 15, "circa": 10}

# Mainline markets trust sharp, high-volume books (Pinnacle, Circa) most heavily.
# Props markets weight recreational books higher because they offer the best numbers
# and Pinnacle/Circa limit or don't offer many props.
BOOK_WEIGHTS: dict[str, dict[str, int]] = {
    "nba_moneyline":    dict(_MAINLINE),
    "nba_props":        dict(_PROPS),
    "nba_first_quarter": dict(_PROPS),   # derivative market — props weighting applies
    "nfl_spreads":      dict(_MAINLINE),
    "nfl_moneyline":    dict(_MAINLINE),
    "mlb_moneyline":    dict(_MAINLINE),
}

_DEFAULT_KEY = "nba_moneyline"


def get_weights(sport: str, market: str) -> dict[str, int]:
    """Return the raw (un-normalised) book weights for the given sport/market pair.

    Looks up '{sport}_{market}' in BOOK_WEIGHTS.
    Falls back to the nba_moneyline weight set if the key is not found.
    """
    key = f"{sport}_{market}"
    return dict(BOOK_WEIGHTS.get(key, BOOK_WEIGHTS[_DEFAULT_KEY]))


def normalize_weights(weights_dict: dict[str, int | float]) -> dict[str, float]:
    """Scale a weight dictionary so that all values sum to exactly 1.0."""
    total = sum(weights_dict.values())
    return {book: round(weight / total, 6) for book, weight in weights_dict.items()}
