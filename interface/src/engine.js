// engine.js — JavaScript port of the betting math engine
// Mirrors the logic in engine/odds.py, devig.py, ev.py, kelly.py, arb.py,
// market_width.py, and promotions.py so the UI can compute everything client-side.

const round = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places;

// ---------------------------------------------------------------------------
// Odds conversions
// ---------------------------------------------------------------------------

export function americanToDecimal(odds) {
  if (odds === 0) throw new Error("Odds cannot be zero.");
  return odds > 0
    ? round(odds / 100 + 1)
    : round(100 / Math.abs(odds) + 1);
}

export function decimalToAmerican(decimal) {
  // >= 2.0 pays better than even money → positive American odds
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

export function impliedProbability(americanOdds) {
  if (americanOdds > 0) return round(100 / (americanOdds + 100));
  const abs = Math.abs(americanOdds);
  return round(abs / (abs + 100));
}

export function probabilityToAmerican(prob) {
  if (prob <= 0 || prob >= 1) throw new Error("Probability must be between 0 and 1 exclusive.");
  return prob >= 0.5
    ? Math.round((-100 * prob) / (1 - prob))
    : Math.round((100 * (1 - prob)) / prob);
}

// ---------------------------------------------------------------------------
// Devig
// ---------------------------------------------------------------------------

export function devig(side1Odds, side2Odds) {
  const p1 = impliedProbability(side1Odds);
  const p2 = impliedProbability(side2Odds);
  const total = p1 + p2;

  const fairProb1 = round(p1 / total);
  const fairProb2 = round(p2 / total);
  const vigPct    = round((total - 1) * 100);

  return {
    fairProb1,
    fairProb2,
    fairOdds1: probabilityToAmerican(fairProb1),
    fairOdds2: probabilityToAmerican(fairProb2),
    vigPct,
  };
}

// ---------------------------------------------------------------------------
// Alternative devigging methods
// ---------------------------------------------------------------------------

// Power method — raises each implied probability to the power k, where k is
// found via Newton's method so that the scaled probabilities sum to exactly 1.
// k > 1 for a market with vig, meaning each prob is reduced. The reduction is
// non-linear: underdogs lose more probability than favourites, which corrects
// the favourite-longshot bias present in the multiplicative method.
export function devigPower(side1Odds, side2Odds) {
  const p1  = impliedProbability(side1Odds);
  const p2  = impliedProbability(side2Odds);
  const lp1 = Math.log(p1);
  const lp2 = Math.log(p2);

  // f(k) = p1^k + p2^k − 1   →   find root via Newton's method
  // f′(k) = p1^k·ln(p1) + p2^k·ln(p2)
  let k = 0.95;
  for (let i = 0; i < 100; i++) {
    const pk1 = Math.pow(p1, k);
    const pk2 = Math.pow(p2, k);
    const f   = pk1 + pk2 - 1;
    if (Math.abs(f) < 0.0001) break;
    const df  = pk1 * lp1 + pk2 * lp2;
    k -= f / df;
  }

  const r1   = Math.pow(p1, k);
  const r2   = Math.pow(p2, k);
  const norm = r1 + r2;                     // normalize away any float residue
  const fp1  = round(r1 / norm);
  const fp2  = round(r2 / norm);

  return {
    fairProb1: fp1,
    fairProb2: fp2,
    fairOdds1: probabilityToAmerican(fp1),
    fairOdds2: probabilityToAmerican(fp2),
    vigPct:    round((p1 + p2 - 1) * 100),
    k:         round(k),
  };
}

// Shin method — economic model that attributes the bookmaker's margin to the
// presence of bettors with insider information. Parameter z (the insider
// fraction) is solved iteratively via bisection.
// Formula per outcome: (√(z² + 4(1−z)·p²) − z) / (2(1−z))
// where p is the raw implied probability for that outcome.
export function devigShin(side1Odds, side2Odds) {
  const p1 = impliedProbability(side1Odds);
  const p2 = impliedProbability(side2Odds);

  const shinFair = z => {
    const denom = 2 * (1 - z);
    return [p1, p2].map(p => (Math.sqrt(z * z + 4 * (1 - z) * p * p) - z) / denom);
  };

  // At z=0 the sum equals the raw overround (>1); we bisect until sum = 1.
  let lo = 0, hi = 0.999;
  for (let i = 0; i < 200; i++) {
    const z   = (lo + hi) / 2;
    const sum = shinFair(z).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) < 0.0001) break;
    if (sum > 1) lo = z; else hi = z;
  }

  const z       = (lo + hi) / 2;
  const [f1, f2] = shinFair(z);
  const fp1 = round(f1);
  const fp2 = round(f2);

  return {
    fairProb1: fp1,
    fairProb2: fp2,
    fairOdds1: probabilityToAmerican(fp1),
    fairOdds2: probabilityToAmerican(fp2),
    vigPct:    round((p1 + p2 - 1) * 100),
    z:         round(z),
  };
}

// Logarithmic method — fair probability for each outcome is its log implied
// probability divided by the sum of all log implied probabilities.
// Because log(p) < 0 for p < 1 and both logs are negative, the result is
// positive and the two shares sum to 1 exactly.
// ⚠  Valid only for markets with 3 or more outcomes (futures, 3-way soccer,
//    tournament win markets). For two-way lines the formula inverts the
//    favourite/underdog relationship and is excluded from devigAll consensus.
export function devigLogarithmic(side1Odds, side2Odds) {
  const p1   = impliedProbability(side1Odds);
  const p2   = impliedProbability(side2Odds);
  const lp1  = Math.log(p1);
  const lp2  = Math.log(p2);
  const sumL = lp1 + lp2;          // negative; dividing keeps signs consistent

  const fp1 = round(lp1 / sumL);
  const fp2 = round(lp2 / sumL);

  return {
    fairProb1: fp1,
    fairProb2: fp2,
    fairOdds1: probabilityToAmerican(fp1),
    fairOdds2: probabilityToAmerican(fp2),
    vigPct:    round((p1 + p2 - 1) * 100),
  };
}

// Aggregator — runs multiplicative, power, and Shin and returns a unified result.
// Logarithmic is computed and included in the return value for reference but is
// intentionally excluded from consensus and spread: on two-way markets it inverts
// the favourite/underdog relationship and would corrupt the average.
// consensus: average of the three valid two-way methods.
// spread: max − min fair probability (side 1) across those same three methods.
//   spread < 0.005 → high confidence; 0.005–0.015 → moderate; > 0.015 → low.
export function devigAll(side1Odds, side2Odds) {
  const multiplicative = devig(side1Odds, side2Odds);
  const power          = devigPower(side1Odds, side2Odds);
  const shin           = devigShin(side1Odds, side2Odds);
  const logarithmic    = devigLogarithmic(side1Odds, side2Odds);

  const p1s = [multiplicative.fairProb1, power.fairProb1, shin.fairProb1];
  const p2s = [multiplicative.fairProb2, power.fairProb2, shin.fairProb2];

  const avgP1  = round(p1s.reduce((a, b) => a + b, 0) / 3);
  const avgP2  = round(p2s.reduce((a, b) => a + b, 0) / 3);
  const spread = round(Math.max(...p1s) - Math.min(...p1s));

  return {
    multiplicative,
    power,
    shin,
    logarithmic,          // included for inspection; not used in consensus/spread
    consensus: {
      fairProb1: avgP1,
      fairProb2: avgP2,
      fairOdds1: probabilityToAmerican(avgP1),
      fairOdds2: probabilityToAmerican(avgP2),
    },
    spread,
  };
}

// Default book weights keyed by market type.
// Reflects sharpness: mainline markets favour Pinnacle/Circa; props and
// quarter lines shift toward soft books that offer the most line movement.
export const MARKET_WEIGHTS = {
  'Moneyline':    { Pinnacle: 35, Circa: 25, BetOnline: 20, FanDuel: 10, DraftKings: 10 },
  'Spread':       { Pinnacle: 35, Circa: 25, BetOnline: 20, FanDuel: 10, DraftKings: 10 },
  'Total':        { Pinnacle: 30, Circa: 25, BetOnline: 20, FanDuel: 15, DraftKings: 10 },
  'First Quarter':{ Pinnacle: 20, Circa: 15, BetOnline: 15, FanDuel: 25, DraftKings: 25 },
  'Player Prop':  { FanDuel: 30, DraftKings: 30, Pinnacle: 15, BetOnline: 15, Circa: 10 },
};

export function weightedFairOdds(books) {
  // books: [{ side1Odds, side2Odds, weight }, ...]
  const totalWeight = books.reduce((sum, b) => sum + b.weight, 0);

  const weightedP1 = books.reduce((sum, b) => {
    return sum + devig(b.side1Odds, b.side2Odds).fairProb1 * b.weight;
  }, 0);
  const weightedP2 = books.reduce((sum, b) => {
    return sum + devig(b.side1Odds, b.side2Odds).fairProb2 * b.weight;
  }, 0);

  const fairProb1 = round(weightedP1 / totalWeight);
  const fairProb2 = round(weightedP2 / totalWeight);

  return {
    fairProb1,
    fairProb2,
    fairOdds1: probabilityToAmerican(fairProb1),
    fairOdds2: probabilityToAmerican(fairProb2),
  };
}

// ---------------------------------------------------------------------------
// Expected value
// ---------------------------------------------------------------------------

export function calculateEV(fairOdds, targetOdds) {
  // Correct formula: (fairProb × targetDecimal − 1) × 100
  // fairProb × targetDecimal is the expected return per dollar wagered (profit + stake).
  // Subtracting 1 removes the stake, leaving expected profit per dollar.
  const fairProb      = impliedProbability(fairOdds);
  const targetDecimal = americanToDecimal(targetOdds);
  return round((fairProb * targetDecimal - 1) * 100);
}

// ---------------------------------------------------------------------------
// Kelly criterion
// ---------------------------------------------------------------------------

export function kellyFraction(fairOdds, targetOdds, bankroll, multiplier = 0.5) {
  const winProbability  = impliedProbability(fairOdds);
  const targetDecimal   = americanToDecimal(targetOdds);
  const netOdds         = targetDecimal - 1;          // profit per unit staked on win

  // f* = (p × d − 1) / (d − 1)  — standard Kelly formula
  const fullKellyPct    = round((winProbability * targetDecimal - 1) / netOdds);
  const halfKellyPct    = round(fullKellyPct * multiplier);
  const recommendedBet  = round(halfKellyPct * bankroll, 2);

  return { winProbability, fullKellyPct, halfKellyPct, recommendedBet };
}

// ---------------------------------------------------------------------------
// Arbitrage
// ---------------------------------------------------------------------------

export function detectArbitrage(oddsList) {
  const probs      = oddsList.map(impliedProbability);
  const impliedSum = round(probs.reduce((a, b) => a + b, 0));
  const isArb      = impliedSum < 1.0;
  const profitPct  = isArb ? round((1 / impliedSum - 1) * 100) : 0;
  const margin     = round((impliedSum - 1) * 100);

  return { isArb, impliedSum, profitPct, margin };
}

export function optimalStakes(oddsList, bankroll) {
  const decimals = oddsList.map(americanToDecimal);
  const invSum   = decimals.reduce((sum, d) => sum + 1 / d, 0);
  return decimals.map(d => round(bankroll / (d * invSum), 2));
}

// ---------------------------------------------------------------------------
// Duplicate book detection
// ---------------------------------------------------------------------------

// Books known to mirror another book's lines verbatim.
// Key = copy, value = source. If both appear in an input array, the lower-weight
// one is removed before the weighted fair-odds calculation.
const KNOWN_COPY_PAIRS = {
  'SportsBettingAG': 'BetOnline',
  'BetPhoenix':      'BetOnline',
  'BetNow':          'BetOnline',
  'MyBookie':        'BetOnline',
  'Bookmaker':       'BetOnline',
};

// removeDuplicateBooks — two-pass deduplication for a books array.
//
// booksArray: [{ name, side1Odds, side2Odds, weight }, ...]
//
// Pass 1 — known copy pairs: if both members of a known pair are present, the
//   lower-weighted book is dropped. This fires first so Pass 2 doesn't need to
//   distinguish between intentional line-shopping and real copying.
// Pass 2 — statistical duplicates: any two books with identical side1Odds AND
//   identical side2Odds are almost certainly sharing a feed; keep the highest-
//   weighted one and drop the rest. Catches copy relationships not in the hard-
//   coded list.
//
// Returns { cleanedBooks, removedBooks, warning }
//   cleanedBooks:  filtered array, safe to pass to weightedFairOdds
//   removedBooks:  [{ name, weight, reason }] for each dropped book
//   warning:       human-readable summary string, or null if nothing was removed
export function removeDuplicateBooks(booksArray) {
  const removedBooks = [];
  let working = [...booksArray];

  // ── Pass 1: hard-coded copy pairs ────────────────────────────────────────
  for (const [copyName, sourceName] of Object.entries(KNOWN_COPY_PAIRS)) {
    const copy   = working.find(b => b.name === copyName);
    const source = working.find(b => b.name === sourceName);
    if (!copy || !source) continue;

    const toRemove = copy.weight <= source.weight ? copy : source;
    const toKeep   = toRemove === copy ? source : copy;
    working = working.filter(b => b.name !== toRemove.name);
    removedBooks.push({
      name:   toRemove.name,
      weight: toRemove.weight,
      reason: `removed as known duplicate of ${toKeep.name}`,
    });
  }

  // ── Pass 2: statistical duplicates (identical odds on both sides) ─────────
  const oddsGroups = new Map();
  for (const book of working) {
    const key = `${book.side1Odds}|${book.side2Odds}`;
    if (!oddsGroups.has(key)) oddsGroups.set(key, []);
    oddsGroups.get(key).push(book);
  }

  const cleanedBooks = [];
  for (const [key, group] of oddsGroups) {
    if (group.length === 1) { cleanedBooks.push(group[0]); continue; }

    const sorted  = [...group].sort((a, b) => b.weight - a.weight);
    const keeper  = sorted[0];
    const [o1, o2] = key.split('|');
    cleanedBooks.push(keeper);
    for (const removed of sorted.slice(1)) {
      removedBooks.push({
        name:   removed.name,
        weight: removed.weight,
        reason: `statistical duplicate of ${keeper.name} — identical odds ${o1} / ${o2}`,
      });
    }
  }

  const warning = removedBooks.length > 0
    ? `${removedBooks.length} duplicate${removedBooks.length > 1 ? 's' : ''} removed: ${removedBooks.map(r => r.name).join(', ')}`
    : null;

  return { cleanedBooks, removedBooks, warning };
}

// ---------------------------------------------------------------------------
// Alternate line scanner
// ---------------------------------------------------------------------------

// scanAlternateLines — compares alternate spread / total lines against the fair
// price derived from the main line.
//
// mainLineOdds: American odds for side 1 of the primary (consensus) line.
//   A symmetric spread market is assumed (same juice on both sides), so the main
//   line is deviggged as devig(mainLineOdds, mainLineOdds).  This is the standard
//   convention for point spreads (-110 / -110).
//
// alternateLines: [{ line, side1Odds, side2Odds, book }]
//   line         — the spread or total value (numeric, e.g. -4.5 or 221.5)
//   side1Odds    — American odds for the same side as mainLineOdds
//   side2Odds    — American odds for the opposite side (used to compute the
//                  alternate's own fair odds for reference)
//   book         — sportsbook name (optional)
//
// EV for each alternate = calculateEV(mainFairOdds, altSide1Odds).
// Positive EV: the alternate prices side 1 MORE favourably than the main line's
//   fair value implies (you are getting paid to move the line).
// Negative EV: you are paying a premium to move to that alternate line (typical
//   for buying points toward a favourite cover).
//
// Results are sorted by EV descending (best value first).
export function scanAlternateLines(mainLineOdds, alternateLines) {
  // Fair reference from the main line — symmetric devig gives the no-vig price.
  const mainFair     = devig(mainLineOdds, mainLineOdds);
  const mainFairOdds = mainFair.fairOdds1;   // reference fair odds (e.g. -100 for -110/-110)
  const mainFairProb = mainFair.fairProb1;   // reference fair probability (e.g. 0.5)

  const results = alternateLines.map(alt => {
    // The alternate's own devigged fair — useful context but not used for EV.
    const altFair = devig(alt.side1Odds, alt.side2Odds);
    const ev      = round(calculateEV(mainFairOdds, alt.side1Odds));

    return {
      line:         alt.line,
      book:         alt.book      || '',
      side1Odds:    alt.side1Odds,
      side2Odds:    alt.side2Odds,
      fairOdds:     altFair.fairOdds1,   // alternate's own fair (reference)
      fairProb:     altFair.fairProb1,
      mainFairOdds,
      mainFairProb,
      ev,
    };
  });

  // Best value first.
  return results.sort((a, b) => b.ev - a.ev);
}

// ---------------------------------------------------------------------------
// Middle detection
// ---------------------------------------------------------------------------

// Normal CDF approximation — Abramowitz & Stegun polynomial, max error 7.5e-8.
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-0.5 * z * z);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}

// detectMiddle — identifies middle opportunities on Spread and Total markets.
//
// side1Odds / side2Odds: the spread or total LINE values, not American moneyline odds.
//   Spread example:  side1Odds = -7.5,  side2Odds = +8.5
//   Total example:   side1Odds = 220.5, side2Odds = 221.5
// side1BetOdds / side2BetOdds: American odds at which each side is priced (default -110).
// side1Stake / side2Stake: dollar amount wagered per side (default 100).
//
// Middle window: the gap (in points/total units) where both bets win simultaneously.
// Hit probability: P(result lands in window), modelled as N(midpoint of window, σ=10).
// Worst case loss: net P/L when the middle misses — exactly one side wins, one loses.
// Best case profit: net P/L when both sides win simultaneously.
// Expected value: p × bestCaseProfit + (1−p) × worstCaseLoss  (conservative; uses the
//   worse of the two miss scenarios for the non-middle portion).
export function detectMiddle(
  side1Book, side1Odds, side2Book, side2Odds, market,
  side1Stake = 100, side2Stake = 100,
  side1BetOdds = -110, side2BetOdds = -110
) {
  const o1 = +side1Odds;
  const o2 = +side2Odds;

  let middleWindow = 0;

  if (market === 'Spread') {
    // Requires opposite-sign lines for the same team at two books.
    // e.g. DK: Lakers -7.5 and FD: Lakers +8.5 → both win if Lakers win by exactly 8.
    // Window = |positive line| − |negative line| (positive → gap exists).
    if (o1 < 0 && o2 > 0) middleWindow = o2 - Math.abs(o1);
    else if (o1 > 0 && o2 < 0) middleWindow = o1 - Math.abs(o2);
  } else if (market === 'Total') {
    // Requires Over on the lower line and Under on the higher line.
    // e.g. Over 220.5 and Under 221.5 → both win if game total is 221.
    middleWindow = Math.abs(o2 - o1);
  }

  const hasMiddle = middleWindow > 0;

  if (!hasMiddle) {
    return {
      hasMiddle: false, middleWindow: 0, hitProbability: 0,
      worstCaseLoss: null, bestCaseProfit: null, expectedValue: null,
    };
  }

  // P(result lands in the middle window), centred at the window's midpoint.
  // 2·Φ(w/2σ) − 1 is equivalent to Φ((hi−mid)/σ) − Φ((lo−mid)/σ) for a symmetric window.
  const sigma = 10;
  const hitProbability = round(2 * normalCDF(middleWindow / (2 * sigma)) - 1);

  // Payouts at the actual bet odds.
  const toDecimal = o => o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
  const profit1 = (toDecimal(side1BetOdds) - 1) * side1Stake;
  const profit2 = (toDecimal(side2BetOdds) - 1) * side2Stake;

  const bestCaseProfit = round(profit1 + profit2);

  // By construction, exactly one side wins when the middle misses.
  // scenA: side1 wins, side2 loses → profit1 − side2Stake
  // scenB: side2 wins, side1 loses → profit2 − side1Stake
  const worstCaseLoss = round(Math.min(profit1 - side2Stake, profit2 - side1Stake));

  const expectedValue = round(hitProbability * bestCaseProfit + (1 - hitProbability) * worstCaseLoss);

  return {
    hasMiddle,
    middleWindow:    round(middleWindow),
    hitProbability,
    worstCaseLoss,
    bestCaseProfit,
    expectedValue,
  };
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export function applyPromotion(baseOdds, promoType, promoValue) {
  const decimal = americanToDecimal(baseOdds);

  if (promoType === "profit_boost") {
    // Boost the profit component only; stake still returned
    const boosted = 1 + (decimal - 1) * (1 + promoValue);
    return decimalToAmerican(boosted);
  }
  if (promoType === "odds_boost") {
    return Math.round(baseOdds + promoValue);
  }
  if (promoType === "free_bet") {
    // Stake is not returned on win — strip it from the decimal
    return decimalToAmerican(decimal - 1);
  }
  throw new Error(`Unknown promoType "${promoType}". Use: profit_boost, odds_boost, free_bet.`);
}

// ---------------------------------------------------------------------------
// Market width
// ---------------------------------------------------------------------------

export function calculateMarketWidth(oddsArray) {
  if (!oddsArray.length) throw new Error("oddsArray must not be empty.");

  const highest    = Math.max(...oddsArray);
  const lowest     = Math.min(...oddsArray);
  const widthCents = round(highest - lowest, 4);

  const confidence      = widthCents < 10 ? "tight" : widthCents < 20 ? "moderate" : "wide";
  const kellyMultiplier = widthCents < 10 ? 1.25   : widthCents < 20 ? 1.0        : 0.75;

  return { widthCents, highest, lowest, confidence, kellyMultiplier };
}

/*
=============================================================================
  TEST BLOCK — expected outputs matching the Python engine tests
=============================================================================

  americanToDecimal(150)      → 2.5
  americanToDecimal(-110)     → 1.9091
  decimalToAmerican(2.5)      → 150
  decimalToAmerican(1.9091)   → -110
  impliedProbability(150)     → 0.4
  impliedProbability(-110)    → 0.5238
  probabilityToAmerican(0.4)  → 150
  probabilityToAmerican(0.5238) → -110

  devig(-145, 125)
    → { fairProb1: 0.5711, fairProb2: 0.4289,
        fairOdds1: -133,   fairOdds2: 133, vigPct: 3.6248 }

  calculateEV(-133, -128)     → ~1.6709   (positive = +EV)

  kellyFraction(-133, -128, 10000)
    → { winProbability: 0.5708, fullKellyPct: 0.0214,
        halfKellyPct: 0.0107, recommendedBet: ~107 }

  detectArbitrage([-135, 138])
    → { isArb: true, impliedSum: ~0.9947, profitPct: ~0.5328, margin: ~-0.53 }

  optimalStakes([-135, 138], 1000)
    → [~577.57, ~422.43]

  applyPromotion(150, "profit_boost", 1.0)  → 300

  calculateMarketWidth([-142, -140, -145, -133, -138])
    → { widthCents: 12, confidence: "moderate", kellyMultiplier: 1.0 }

  ── devigAll(-145, 125)  [Lakers -145 / Celtics +125] ───────────────────────

  Input implied probs: p1=0.5918 (Lakers), p2=0.4444 (Celtics), sum=1.0362 (3.62% vig)

  multiplicative  (proportional)
    fairProb1: 0.5711   fairOdds1: -133
    fairProb2: 0.4289   fairOdds2: +133

  power           (Newton, k=1.055 — non-linear; reduces underdog more than favourite)
    fairProb1: 0.575    fairOdds1: -135
    fairProb2: 0.425    fairOdds2: +135
    k: 1.055

  shin            (insider model, z=0.0737 — similar to power for 2-way markets)
    fairProb1: 0.5764   fairOdds1: -136
    fairProb2: 0.4237   fairOdds2: +136
    z: 0.0737

  logarithmic     (log(p_i)/Σlog(p_j) — allocates vig inversely to probability size)
    fairProb1: 0.3928   fairOdds1: +155   ← lower raw prob gets larger log share
    fairProb2: 0.6072   fairOdds2: -155

  logarithmic     (excluded from consensus — only valid for 3+ outcome markets)
    fairProb1: 0.3928   fairOdds1: +155   ← inverts favourite on two-way lines
    fairProb2: 0.6072   fairOdds2: -155

  consensus       (average of multiplicative + power + shin only)
    fairProb1: 0.5742   fairOdds1: -135
    fairProb2: 0.4258   fairOdds2: +135

  spread: 0.0053   ← max−min across mult/power/shin; low spread = high method agreement

  ── scanAlternateLines(-110, [...]) — Lakers -7.5 main line ──────────────────

  mainLineOdds: -110  →  devig(-110, -110): fairProb = 0.5, fairOdds = -100

  alternateLines:
    { line: -4.5, side1Odds: -145, side2Odds: +125, book: 'DraftKings' }
    { line: -6.5, side1Odds: -125, side2Odds: +105, book: 'DraftKings' }
    { line: -9.5, side1Odds: +105, side2Odds: -125, book: 'DraftKings' }

  EV = calculateEV(mainFairOdds = -100, altSide1Odds):
    -4.5  at -145: (0.5 × 1.6897 − 1) × 100 = -15.52%   ← paying heavy to buy points
    -6.5  at -125: (0.5 × 1.80   − 1) × 100 = -10.00%   ← moderate cost
    -9.5  at +105: (0.5 × 2.05   − 1) × 100 = +2.50%    ← getting paid to sell points

  Sorted by EV descending:
    1. { line: -9.5,  ev: +2.50%  }  ← best value — market overpaying for the push
    2. { line: -6.5,  ev: -10.00% }
    3. { line: -4.5,  ev: -15.52% }

  ── removeDuplicateBooks ─────────────────────────────────────────────────────

  Input:
    { name: 'BetOnline',       side1Odds: −115, side2Odds: −105, weight: 20 }
    { name: 'SportsBettingAG', side1Odds: −115, side2Odds: −105, weight: 10 }
    { name: 'Pinnacle',        side1Odds: −112, side2Odds: −108, weight: 35 }

  Pass 1 — SportsBettingAG is a known copy of BetOnline.
           SportsBettingAG (w=10) < BetOnline (w=20) → SportsBettingAG removed.
  Pass 2 — no remaining books share identical odds.

  cleanedBooks:  [{ name: 'BetOnline', w=20 }, { name: 'Pinnacle', w=35 }]
  removedBooks:  [{ name: 'SportsBettingAG', weight: 10,
                    reason: 'removed as known duplicate of BetOnline' }]
  warning:       '1 duplicate removed: SportsBettingAG'

  ── detectMiddle('DraftKings', -7.5, 'FanDuel', 8.5, 'Spread', 100, 100, -110, -110) ──

  Lakers -7.5 @ DraftKings vs Lakers +8.5 @ FanDuel, $100 each side at -110
  Both bets win if Lakers win by exactly 8 (the middle).

  hasMiddle:       true
  middleWindow:    1.0          ← gap = 8.5 − 7.5
  hitProbability:  0.0399       ← P(result in 1-pt window), N(8.0, σ=10)
  worstCaseLoss:   -9.09        ← lose one bet, win one at -110: 90.91 − 100
  bestCaseProfit:  181.82       ← both win at -110: 90.91 × 2
  expectedValue:   -1.53        ← 0.0399×181.82 + 0.9601×(−9.09); +EV needs wider window

=============================================================================
*/
