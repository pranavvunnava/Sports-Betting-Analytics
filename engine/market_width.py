def calculate_market_width(odds_dict: dict[str, float]) -> dict:
    """Measure how tight the market is across books for one side of a bet.

    odds_dict – {book_name: american_odds} for the same outcome at different books

    Width is the spread in American-odds cents between the best (highest) and
    worst (lowest) price available. A tight market means books agree on the
    price — a strong signal the line is sharp and the model should trust it more.

    Thresholds:
      < 10 cents  → tight    → kelly_multiplier 1.25  (high confidence, size up)
       10–19 cents → moderate → kelly_multiplier 1.00  (standard sizing)
      ≥ 20 cents  → wide     → kelly_multiplier 0.75  (disagreement, size down)
    """
    if not odds_dict:
        raise ValueError("odds_dict must contain at least one entry.")

    highest_book = max(odds_dict, key=lambda b: odds_dict[b])
    lowest_book  = min(odds_dict, key=lambda b: odds_dict[b])

    highest_odds = odds_dict[highest_book]
    lowest_odds  = odds_dict[lowest_book]
    width_cents  = round(highest_odds - lowest_odds, 4)

    if width_cents < 10:
        confidence       = "tight"
        kelly_multiplier = 1.25
    elif width_cents < 20:
        confidence       = "moderate"
        kelly_multiplier = 1.00
    else:
        confidence       = "wide"
        kelly_multiplier = 0.75

    return {
        "width_cents":       width_cents,
        "highest_odds":      highest_odds,
        "highest_book":      highest_book,
        "lowest_odds":       lowest_odds,
        "lowest_book":       lowest_book,
        "confidence":        confidence,
        "kelly_multiplier":  kelly_multiplier,
    }


if __name__ == "__main__":
    odds = {
        "Pinnacle":   -142,
        "Circa":      -140,
        "BetOnline":  -145,
        "FanDuel":    -133,
        "DraftKings": -138,
    }

    result = calculate_market_width(odds)
    print(f"width       : {result['width_cents']} cents")
    print(f"highest     : {result['highest_book']} {result['highest_odds']:+}")
    print(f"lowest      : {result['lowest_book']} {result['lowest_odds']:+}")
    print(f"confidence  : {result['confidence']}")
    print(f"kelly mult  : {result['kelly_multiplier']}x")
