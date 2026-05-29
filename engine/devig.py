from engine.odds import implied_probability, probability_to_american


def devig(side1_odds: float, side2_odds: float) -> dict:
    """Remove the vig from a two-way market and return fair probabilities and odds.

    The bookmaker inflates each side's implied probability so that they sum above
    1.0 — the excess is their margin. Dividing each side's raw probability by the
    total normalises them back to a true probability distribution that sums to 1.0.

    Example: Pinnacle Lakers -145 / Celtics +125
      raw:   0.5918 + 0.4444 = 1.0363  (3.63% vig)
      fair:  0.5711 / 0.4289           (sums to 1.0)
    """
    p1 = implied_probability(side1_odds)
    p2 = implied_probability(side2_odds)
    total = p1 + p2  # > 1.0; the excess is the bookmaker's margin

    fair_p1 = round(p1 / total, 4)
    fair_p2 = round(p2 / total, 4)

    return {
        "fair_prob_side1":  fair_p1,
        "fair_prob_side2":  fair_p2,
        "fair_odds_side1":  probability_to_american(fair_p1),
        "fair_odds_side2":  probability_to_american(fair_p2),
    }


def weighted_fair_odds(books: list[dict]) -> dict:
    """Consensus fair odds from multiple books, weighted by trust/sharpness.

    Each entry in books must have:
      side1_odds  – American odds for side 1
      side2_odds  – American odds for side 2
      weight      – relative weight for this book (e.g. 1.0 for Pinnacle, 0.5 for Draftkings)

    Steps:
      1. Devig each book independently.
      2. Take the weighted average of the fair probabilities across all books.
      3. Convert the consensus probabilities back to American odds.

    Returns the same four keys as devig(), prefixed with nothing (they represent
    the consensus view across all books provided).
    """
    total_weight = sum(b["weight"] for b in books)

    weighted_p1 = sum(devig(b["side1_odds"], b["side2_odds"])["fair_prob_side1"] * b["weight"] for b in books)
    weighted_p2 = sum(devig(b["side1_odds"], b["side2_odds"])["fair_prob_side2"] * b["weight"] for b in books)

    consensus_p1 = round(weighted_p1 / total_weight, 4)
    consensus_p2 = round(weighted_p2 / total_weight, 4)

    return {
        "fair_prob_side1":  consensus_p1,
        "fair_prob_side2":  consensus_p2,
        "fair_odds_side1":  probability_to_american(consensus_p1),
        "fair_odds_side2":  probability_to_american(consensus_p2),
    }


if __name__ == "__main__":
    # Quick test: Pinnacle Lakers -145 / Celtics +125
    result = devig(-145, 125)
    print("=== devig(-145, +125) ===")
    print(f"  fair_prob_side1  (Lakers): {result['fair_prob_side1']}")
    print(f"  fair_prob_side2 (Celtics): {result['fair_prob_side2']}")
    print(f"  fair_odds_side1  (Lakers): {result['fair_odds_side1']:+.1f}")
    print(f"  fair_odds_side2 (Celtics): {result['fair_odds_side2']:+.1f}")
    print(f"  probs sum to:              {result['fair_prob_side1'] + result['fair_prob_side2']}")
