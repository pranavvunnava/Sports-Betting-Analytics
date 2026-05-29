const BASE = 'https://api.the-odds-api.com/v4';

export const SPORTS = [
  { key: 'basketball_nba',       label: 'NBA' },
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'baseball_mlb',         label: 'MLB' },
];

export function getApiKey() {
  return localStorage.getItem('edgelab_apikey') || '';
}

export function saveApiKey(key) {
  localStorage.setItem('edgelab_apikey', key.trim());
}

export async function fetchOdds(sportKey, markets = ['h2h', 'spreads', 'totals']) {
  const key = getApiKey();
  if (!key) throw new Error('No API key — add one in Settings');
  const params = new URLSearchParams({
    apiKey:      key,
    regions:     'us',
    markets:     markets.join(','),
    oddsFormat:  'american',
  });
  const res = await fetch(`${BASE}/sports/${sportKey}/odds?${params}`);
  if (res.status === 401) throw new Error('Invalid API key — check Settings');
  if (res.status === 422) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? ': ' + text.slice(0, 120) : ''}`);
  }
  return res.json();
}

export async function fetchAllOdds() {
  const results = await Promise.allSettled(
    SPORTS.map(s => fetchOdds(s.key))
  );
  return results.flatMap((r, i) =>
    r.status === 'fulfilled'
      ? r.value.map(g => ({ ...g, sportLabel: SPORTS[i].label }))
      : []
  );
}

// Returns [{side, odds, book}] for the best available odds per outcome in a market
export function bestOddsForMarket(game, marketKey) {
  const best = {};
  for (const bm of game.bookmakers || []) {
    const mkt = bm.markets?.find(m => m.key === marketKey);
    if (!mkt) continue;
    for (const oc of mkt.outcomes) {
      const name = oc.point != null
        ? `${oc.name} ${oc.point > 0 ? '+' : ''}${oc.point}`
        : oc.name;
      if (!best[name] || oc.price > best[name].odds) {
        best[name] = { odds: oc.price, book: bm.title };
      }
    }
  }
  return Object.entries(best).map(([side, v]) => ({ side, odds: v.odds, book: v.book }));
}
