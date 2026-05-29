import { useState, useMemo, useEffect, useCallback } from 'react';
import { weightedFairOdds, calculateEV, kellyFraction, calculateMarketWidth, MARKET_WEIGHTS, devigAll } from './engine';
import { getApiKey, fetchOdds, SPORTS } from './api';

const BOOK_OPTIONS   = ['Pinnacle', 'Circa', 'BetOnline', 'FanDuel', 'DraftKings'];
const MARKET_OPTIONS = ['Moneyline', 'Spread', 'Total', 'First Quarter', 'Player Prop'];
const PENDING_KEY    = 'edgelab_pending_bets';

const CONFIDENCE_LEVELS = {
  'Unproven':  { mult: 0.15, label: '0.15x base kelly' },
  'Some data': { mult: 0.25, label: '0.25x base kelly' },
  'Validated': { mult: 0.35, label: '0.35x base kelly' },
  'Optimized': { mult: 0.50, label: '0.50x base kelly' },
};

const TOGGLE_DEFS = [
  { key: 'allBooksEV',    label: 'All Books +EV',   mult: 2.00, desc: 'Every sharp book confirms positive EV' },
  { key: 'liquidMarket',  label: 'Liquid Market',   mult: 1.50, desc: 'NBA / NFL / MLB mainline with high volume' },
  { key: 'marketCrossed', label: 'Market Crossed',  mult: 1.50, desc: 'Arbitrage exists somewhere in this market' },
  { key: 'softBook',      label: 'Soft Book',       mult: 1.25, desc: 'FanDuel, DraftKings, BetMGM, or Caesars' },
  { key: 'tightMarket',   label: 'Tight Market',    mult: 1.25, desc: 'Books agree within 10 cents', auto: true },
  { key: 'sharpMoney',    label: 'Sharp Money',     mult: 1.50, desc: 'Line moved toward your side on sharp books' },
];

const STOP_WORDS = new Set(['vs', 'at', 'the', 'and', 'or', 'a', 'an', 'in']);
function tokenize(str) {
  return (str || '').toLowerCase().split(/[\s\-/@,]+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
}
function detectCorrelation(pendingBets, gameDesc, betSide, market) {
  if (!gameDesc.trim() || pendingBets.length === 0) return [];
  const newGameTokens = tokenize(gameDesc);
  if (newGameTokens.length === 0) return [];
  return pendingBets.flatMap(p => {
    const pendingGameTokens = tokenize(p.gameDesc);
    const gameOverlap = newGameTokens.filter(t => pendingGameTokens.includes(t));
    if (gameOverlap.length === 0) return [];
    const newSideTokens     = tokenize(betSide);
    const pendingSideTokens = tokenize(p.betSide);
    const sameTeam   = newSideTokens.length > 0 && pendingSideTokens.length > 0 && newSideTokens.some(t => pendingSideTokens.includes(t));
    const sameMarket = market === p.market;
    if (sameTeam && sameMarket)  return [{ ...p, correlationType: 'same_team_same_market',  reduction: 0.40 }];
    if (sameTeam && !sameMarket) return [{ ...p, correlationType: 'same_team_diff_market',   reduction: 0.25 }];
    return                              [{ ...p, correlationType: 'same_game_diff_team',      reduction: 0.00, warning: true }];
  });
}

const getWeight = (book, market) => (MARKET_WEIGHTS[market] ?? MARKET_WEIGHTS['Moneyline'])[book] ?? 10;
const fmtOdds   = n => n > 0 ? `+${n}` : `${n}`;
const fmtPct    = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const r2        = n => Math.round(n * 100) / 100;
const makeRows  = market => [
  { book: 'Pinnacle',  side1: '', side2: '', weight: getWeight('Pinnacle',  market) },
  { book: 'Circa',     side1: '', side2: '', weight: getWeight('Circa',     market) },
  { book: 'BetOnline', side1: '', side2: '', weight: getWeight('BetOnline', market) },
];

function Label({ children }) {
  return <div style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 6, fontWeight: '600' }}>{children}</div>;
}
function SectionHeader({ children }) {
  return <div style={{ fontSize: 13, letterSpacing: 2, color: '#007a4d', textTransform: 'uppercase', fontWeight: '700', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #007a4d' }}>{children}</div>;
}
function Input({ value, onChange, placeholder, style }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
      background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a',
      fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px',
      outline: 'none', width: '100%', boxSizing: 'border-box', ...style,
    }} />
  );
}
function Select({ value, onChange, options, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a',
      fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px',
      outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box', ...style,
    }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function ResultRow({ label, value, color, large, dimLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: large ? '14px 0' : '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 12, letterSpacing: 1, color: dimLabel ? '#ccc' : '#666', textTransform: 'uppercase', fontWeight: '600' }}>{label}</span>
      <span style={{ fontSize: large ? 18 : 15, fontWeight: '700', color: color || '#1a1a1a' }}>{value}</span>
    </div>
  );
}
function Divider() { return <div style={{ borderTop: '1px solid #e8e8e8', margin: '14px 0' }} />; }

export default function ModelTab() {
  const [market,     setMarket]     = useState('Moneyline');
  const [rows,       setRows]       = useState(() => makeRows('Moneyline'));
  const [betBook,    setBetBook]    = useState('');
  const [betOdds,    setBetOdds]    = useState('');
  const [bankroll,   setBankroll]   = useState('250');
  const [confidence, setConfidence] = useState('Unproven');
  const [hardCapPct, setHardCapPct] = useState('3');
  const [toggles,         setToggles]         = useState(() => Object.fromEntries(TOGGLE_DEFS.map(t => [t.key, false])));
  const [gameDescription, setGameDescription] = useState('');
  const [betSide,         setBetSide]         = useState('');
  const [pendingBets,     setPendingBets]      = useState(() => {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(PENDING_KEY, JSON.stringify(pendingBets)); }, [pendingBets]);

  const hasApiKey = !!getApiKey();
  const [liveSport,    setLiveSport]    = useState('basketball_nba');
  const [liveGames,    setLiveGames]    = useState([]);
  const [liveGame,     setLiveGame]     = useState('');
  const [liveMkt,      setLiveMkt]      = useState('h2h');
  const [loadingGames, setLoadingGames] = useState(false);
  const [loadError,    setLoadError]    = useState('');

  const fetchGames = useCallback(async sport => {
    setLoadingGames(true); setLoadError(''); setLiveGames([]); setLiveGame('');
    try { setLiveGames(await fetchOdds(sport, ['h2h', 'spreads', 'totals'])); }
    catch (e) { setLoadError(e.message); }
    finally { setLoadingGames(false); }
  }, []);

  const handleLoadGame = () => {
    const game = liveGames[+liveGame];
    if (!game) return;
    const newRows = [];
    for (const bm of game.bookmakers || []) {
      const mkt = bm.markets?.find(m => m.key === liveMkt);
      if (!mkt || mkt.outcomes.length < 2) continue;
      const mktLabel = liveMkt === 'h2h' ? 'Moneyline' : liveMkt === 'spreads' ? 'Spread' : 'Total';
      newRows.push({ book: bm.title, side1: String(mkt.outcomes[0].price), side2: String(mkt.outcomes[1].price), weight: getWeight(bm.title, mktLabel) });
    }
    if (newRows.length === 0) return;
    setMarket(liveMkt === 'h2h' ? 'Moneyline' : liveMkt === 'spreads' ? 'Spread' : 'Total');
    setRows(newRows);
    setGameDescription(`${game.away_team} @ ${game.home_team}`);
  };

  const handleMarketChange = m => { setMarket(m); setRows(prev => prev.map(r => ({ ...r, weight: getWeight(r.book, m) }))); };
  const updateRow = (i, field, value) => setRows(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; if (field === 'book') next[i].weight = getWeight(value, market); return next; });
  const addRow    = () => setRows(prev => [...prev, { book: 'FanDuel', side1: '', side2: '', weight: getWeight('FanDuel', market) }]);
  const removeRow = i  => setRows(prev => prev.filter((_, idx) => idx !== i));
  const setToggle = (key, val) => setToggles(prev => ({ ...prev, [key]: val }));

  const results = useMemo(() => {
    try {
      const valid = rows.filter(r => r.side1 !== '' && r.side2 !== '' && !isNaN(+r.side1) && !isNaN(+r.side2) && +r.side1 !== 0 && +r.side2 !== 0);
      if (valid.length === 0) return null;
      const books = valid.map(r => ({ side1Odds: +r.side1, side2Odds: +r.side2, weight: +r.weight || 1 }));
      const fair  = weightedFairOdds(books);
      const width = calculateMarketWidth(valid.map(r => +r.side1));
      const devigMethods = devigAll(fair.fairOdds1, fair.fairOdds2);
      if (!betOdds || isNaN(+betOdds) || +betOdds === 0) return { fair, width, devigMethods, ev: null };
      const bl            = +bankroll || 250;
      const consensusOdds = devigMethods.consensus.fairOdds1;
      const ev            = calculateEV(consensusOdds, +betOdds);
      const kelly         = kellyFraction(consensusOdds, +betOdds, bl, 1.0);
      const confMult      = CONFIDENCE_LEVELS[confidence].mult;
      const baseBet       = r2(kelly.fullKellyPct * bl * confMult);
      const activeToggles = TOGGLE_DEFS.filter(t => toggles[t.key]);
      const compoundMult  = activeToggles.reduce((acc, t) => acc * t.mult, 1);
      const finalBet      = r2(baseBet * compoundMult);
      const capPct        = +hardCapPct || 3;
      const hardCap       = r2(bl * capPct / 100);
      const capped        = finalBet > hardCap;
      const cappedBet     = capped ? hardCap : finalBet;
      const correlations     = detectCorrelation(pendingBets, gameDescription, betSide, market);
      const maxReduction     = correlations.length > 0 ? Math.max(...correlations.map(c => c.reduction)) : 0;
      const adjustedBet      = r2(cappedBet * (1 - maxReduction));
      const correlationsJson = JSON.stringify(correlations);
      return { fair, width, devigMethods, ev, winProbability: kelly.winProbability, fullKellyDollar: r2(kelly.fullKellyPct * bl), baseBet, activeToggles, compoundMult: Math.round(compoundMult * 10000) / 10000, finalBet, hardCap, capped, cappedBet, correlations, correlationsJson, adjustedBet, maxReduction };
    } catch (_) { return null; }
  }, [rows, betOdds, bankroll, confidence, hardCapPct, toggles, gameDescription, betSide, pendingBets, market]);

  useEffect(() => {
    if (results?.width?.confidence === 'tight') setToggle('tightMarket', true);
  }, [results?.width?.confidence]); // eslint-disable-line

  const logBet = () => {
    if (!hasEV || !gameDescription.trim()) return;
    setPendingBets(prev => [...prev, { gameDesc: gameDescription, betSide, market, odds: +betOdds, stake: results.adjustedBet }]);
  };

  const hasResults = results !== null;
  const hasEV      = hasResults && results.ev !== null;
  const evPositive = hasEV && results.ev > 0;
  const bl         = +bankroll || 250;
  const hardCapAmt = r2(bl * (+hardCapPct || 3) / 100);

  const s = {
    root:      { fontFamily: "'Courier New', monospace", color: '#1a1a1a' },
    grid2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 },
    grid3:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 },
    section:   { marginBottom: 32 },
    table:     { width: '100%', borderCollapse: 'collapse' },
    th:        { fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', textAlign: 'left', padding: '0 8px 10px 0', fontWeight: '600' },
    td:        { padding: '4px 8px 4px 0', verticalAlign: 'middle' },
    btnAdd:    { background: '#fff', border: '1px solid #007a4d', color: '#007a4d', fontFamily: "'Courier New', monospace", fontSize: 16, padding: '4px 14px', cursor: 'pointer' },
    btnRemove: { background: '#fff', border: '1px solid #cc2222', color: '#cc2222', fontFamily: "'Courier New', monospace", fontSize: 16, padding: '4px 10px', cursor: 'pointer' },
    resultsBox: { background: '#f4f4f4', border: '1px solid #e0e0e0', padding: '24px 28px' },
    verdict: ok => ({
      textAlign: 'center', fontSize: 20, fontWeight: '700', letterSpacing: 4,
      color: ok ? '#007a4d' : '#cc2222',
      border: `2px solid ${ok ? '#007a4d' : '#cc2222'}`,
      background: ok ? '#f0f9f4' : '#fdf0f0',
      padding: '16px 0', marginTop: 20,
    }),
  };

  return (
    <div style={s.root}>

      {/* Live Game Loader */}
      {hasApiKey && (
        <div style={s.section}>
          <SectionHeader>Load Live Game</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr auto', gap: 12, marginBottom: 10 }}>
            <div>
              <Label>Sport</Label>
              <select value={liveSport} onChange={e => { setLiveSport(e.target.value); fetchGames(e.target.value); }} style={{ background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a', fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px', outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                {SPORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Game</Label>
              <select value={liveGame} onChange={e => setLiveGame(e.target.value)} disabled={liveGames.length === 0} style={{ background: '#fff', border: '1px solid #d0d0d0', color: liveGames.length ? '#1a1a1a' : '#aaa', fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px', outline: 'none', cursor: liveGames.length ? 'pointer' : 'default', width: '100%', boxSizing: 'border-box' }}>
                <option value="">{loadingGames ? 'Loading...' : liveGames.length ? 'Pick a game' : 'Fetch games first'}</option>
                {liveGames.map((g, i) => <option key={g.id} value={i}>{g.away_team} @ {g.home_team}</option>)}
              </select>
            </div>
            <div>
              <Label>Market</Label>
              <select value={liveMkt} onChange={e => setLiveMkt(e.target.value)} style={{ background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a', fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px', outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                <option value="h2h">Moneyline</option>
                <option value="spreads">Spread</option>
                <option value="totals">Total</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label>&nbsp;</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => fetchGames(liveSport)} disabled={loadingGames} style={{ background: '#f0f0f0', border: '1px solid #d0d0d0', color: '#666', fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 1, padding: '8px 12px', cursor: 'pointer' }}>
                  {loadingGames ? '...' : 'Fetch'}
                </button>
                <button onClick={handleLoadGame} disabled={!liveGame} style={{ background: liveGame ? '#1a1a1a' : '#f0f0f0', border: '1px solid #d0d0d0', color: liveGame ? '#fff' : '#aaa', fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 1, padding: '8px 12px', cursor: liveGame ? 'pointer' : 'default' }}>
                  Load
                </button>
              </div>
            </div>
          </div>
          {loadError && <div style={{ fontSize: 12, color: '#cc2222' }}>{loadError}</div>}
        </div>
      )}

      <div style={{ ...s.grid2, maxWidth: 400 }}>
        <div><Label>Market</Label><Select value={market} onChange={handleMarketChange} options={MARKET_OPTIONS} /></div>
      </div>

      <div style={s.section}>
        <SectionHeader>Sharp Books</SectionHeader>
        <table style={s.table}>
          <thead>
            <tr>{['Book', 'Side 1 Odds', 'Side 2 Odds', 'Weight', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td style={{ ...s.td, width: '26%' }}><Select value={row.book} onChange={v => updateRow(i, 'book', v)} options={BOOK_OPTIONS} /></td>
                <td style={{ ...s.td, width: '22%' }}><Input value={row.side1} onChange={v => updateRow(i, 'side1', v)} placeholder="-145" /></td>
                <td style={{ ...s.td, width: '22%' }}><Input value={row.side2} onChange={v => updateRow(i, 'side2', v)} placeholder="+125" /></td>
                <td style={{ ...s.td, width: '16%' }}><Input value={row.weight} onChange={v => updateRow(i, 'weight', v)} placeholder="35" /></td>
                <td style={{ ...s.td, width: '8%', textAlign: 'right' }}>
                  {rows.length > 1 && <button style={s.btnRemove} onClick={() => removeRow(i)}>−</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}><button style={s.btnAdd} onClick={addRow}>+ Add Book</button></div>
      </div>

      <div style={s.section}>
        <SectionHeader>Your Bet</SectionHeader>
        <div style={{ ...s.grid3, marginBottom: 16 }}>
          <div><Label>Book</Label><Input value={betBook} onChange={setBetBook} placeholder="e.g. FanDuel" /></div>
          <div><Label>Your Odds</Label><Input value={betOdds} onChange={setBetOdds} placeholder="-128" /></div>
          <div><Label>Bankroll ($)</Label><Input value={bankroll} onChange={setBankroll} placeholder="250" /></div>
        </div>
        <div style={{ ...s.grid2, marginBottom: 0 }}>
          <div><Label>Game Description</Label><Input value={gameDescription} onChange={setGameDescription} placeholder="e.g. Lakers vs Celtics" /></div>
          <div><Label>Your Side / Team</Label><Input value={betSide} onChange={setBetSide} placeholder="e.g. Lakers" /></div>
        </div>
      </div>

      <div style={s.section}>
        <SectionHeader>Model Confidence</SectionHeader>
        <div style={s.grid2}>
          <div><Label>Confidence Level</Label><Select value={confidence} onChange={setConfidence} options={Object.keys(CONFIDENCE_LEVELS)} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <span style={{ fontSize: 13, color: '#888' }}>{CONFIDENCE_LEVELS[confidence].label}</span>
          </div>
        </div>
      </div>

      <div style={s.section}>
        <SectionHeader>Kelly Multipliers</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 32px', marginBottom: 20 }}>
          {TOGGLE_DEFS.map(t => {
            const checked = toggles[t.key];
            return (
              <label key={t.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={e => setToggle(t.key, e.target.checked)} style={{ accentColor: '#007a4d', width: 14, height: 14, marginTop: 3, flexShrink: 0, cursor: 'pointer' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: checked ? '#1a1a1a' : '#999', fontWeight: checked ? '700' : '400' }}>
                      {t.label}
                      {t.auto && <span style={{ fontSize: 10, color: '#ccc', marginLeft: 6, letterSpacing: 1 }}>AUTO</span>}
                    </span>
                    <span style={{ fontSize: 14, color: checked ? '#007a4d' : '#ccc', fontWeight: '700', marginLeft: 12 }}>x{t.mult.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>{t.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Label>Hard Cap</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input value={hardCapPct} onChange={setHardCapPct} placeholder="3" style={{ width: 64 }} />
            <span style={{ fontSize: 13, color: '#888' }}>% of bankroll</span>
            <span style={{ fontSize: 13, color: '#cc2222', fontWeight: '700' }}>= ${hardCapAmt.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style={s.section}>
        <SectionHeader>Model Output</SectionHeader>
        <div style={s.resultsBox}>
          {!hasResults ? (
            <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Enter sharp book odds above</div>
          ) : (
            <>
              <ResultRow label="Weighted Fair — Side 1" value={fmtOdds(results.fair.fairOdds1)} />
              <ResultRow label="Weighted Fair — Side 2" value={fmtOdds(results.fair.fairOdds2)} />
              <ResultRow label="Win Prob — Side 1"      value={`${(results.fair.fairProb1 * 100).toFixed(2)}%`} />
              <ResultRow label="Win Prob — Side 2"      value={`${(results.fair.fairProb2 * 100).toFixed(2)}%`} />
              <Divider />
              {(() => {
                const dm = results.devigMethods;
                const spread     = dm.spread;
                const confColor  = spread < 0.005 ? '#007a4d' : spread < 0.015 ? '#c87800' : '#cc2222';
                const confLabel  = spread < 0.005 ? 'High Confidence' : spread < 0.015 ? 'Moderate' : 'Low Confidence';
                return (
                  <>
                    <div style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' }}>Devig Methods</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                      <thead>
                        <tr>{['Method', 'Side 1', 'Side 2'].map(h => <th key={h} style={{ fontSize: 11, letterSpacing: 1, color: '#aaa', textTransform: 'uppercase', textAlign: 'left', padding: '0 0 6px 0', fontWeight: '600' }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Multiplicative', d: dm.multiplicative, consensus: false },
                          { label: 'Power',          d: dm.power,          consensus: false },
                          { label: 'Shin',           d: dm.shin,           consensus: false },
                          { label: 'Consensus',      d: dm.consensus,      consensus: true  },
                        ].map(({ label, d, consensus }) => (
                          <tr key={label} style={{ background: consensus ? '#e8f5ef' : 'transparent' }}>
                            <td style={{ padding: '5px 0', fontSize: 12, letterSpacing: 1, color: consensus ? '#007a4d' : '#999', fontWeight: consensus ? '700' : '400', textTransform: 'uppercase' }}>{label}</td>
                            <td style={{ padding: '5px 8px 5px 0', fontSize: 14, fontWeight: '700', color: consensus ? '#007a4d' : '#1a1a1a' }}>{fmtOdds(d.fairOdds1)}</td>
                            <td style={{ padding: '5px 0', fontSize: 14, fontWeight: '700', color: consensus ? '#007a4d' : '#1a1a1a' }}>{fmtOdds(d.fairOdds2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase', fontWeight: '600' }}>Method spread</span>
                      <span style={{ fontSize: 13, fontWeight: '700', color: confColor }}>{spread.toFixed(4)}</span>
                      <span style={{ fontSize: 12, fontWeight: '700', color: confColor }}>{confLabel}</span>
                    </div>
                  </>
                );
              })()}
              <Divider />
              <ResultRow label="Market Width" value={`${results.width.widthCents} cents — ${results.width.confidence.toUpperCase()}`} color={results.width.confidence === 'tight' ? '#007a4d' : results.width.confidence === 'wide' ? '#cc2222' : '#1a1a1a'} />
              {hasEV ? (
                <>
                  <Divider />
                  <ResultRow label="EV %" value={fmtPct(results.ev)} color={evPositive ? '#007a4d' : '#cc2222'} />
                  <ResultRow label="Win Probability" value={`${(results.winProbability * 100).toFixed(2)}%`} />
                  <Divider />
                  <ResultRow label={`Base Kelly (${confidence} ${CONFIDENCE_LEVELS[confidence].mult}x)`} value={`$${results.baseBet.toFixed(2)}`} />
                  {results.activeToggles.length > 0
                    ? results.activeToggles.map(t => <ResultRow key={t.key} label={`  x ${t.label}`} value={`x${t.mult.toFixed(2)}`} color="#007a4d" dimLabel />)
                    : <ResultRow label="  No multipliers active" value="x1.00" dimLabel />
                  }
                  {results.activeToggles.length > 1 && <ResultRow label="  Combined Multiplier" value={`x${results.compoundMult}`} color="#007a4d" dimLabel />}
                  <Divider />
                  <ResultRow label="Final Recommended Bet" value={`$${results.finalBet.toFixed(2)}`} color="#007a4d" large />
                  {results.capped && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ fontSize: 12, letterSpacing: 1, color: '#cc2222', textTransform: 'uppercase', fontWeight: '600' }}>Exceeds hard cap (${results.hardCap.toFixed(2)}) — capped at</span>
                      <span style={{ fontSize: 16, fontWeight: '700', color: '#cc2222' }}>${results.cappedBet.toFixed(2)}</span>
                    </div>
                  )}
                  {results.correlations.length > 0 && (
                    <>
                      <Divider />
                      {results.correlations.map((c, i) => {
                        const isWarning = c.correlationType === 'same_game_diff_team';
                        const typeText = {
                          same_team_same_market: `Same team + same market on ${c.gameDesc} — 40% reduction`,
                          same_team_diff_market: `Same team, different market on ${c.gameDesc} — 25% reduction`,
                          same_game_diff_team:   `Same game, different team (${c.betSide} ${c.market}) — verify`,
                        }[c.correlationType];
                        return <div key={i} style={{ padding: '8px 12px', marginBottom: 4, background: isWarning ? '#fdf5f5' : '#f0f9f4', border: `1px solid ${isWarning ? '#f0cccc' : '#c8e8d8'}`, fontSize: 12, color: isWarning ? '#cc3322' : '#007a4d' }}>{typeText}</div>;
                      })}
                      {results.maxReduction > 0 && <ResultRow label={`Correlation adjustment (x${(1 - results.maxReduction).toFixed(2)})`} value={`$${results.adjustedBet.toFixed(2)}`} color="#c87800" large />}
                    </>
                  )}
                  <div style={s.verdict(evPositive)}>{evPositive ? '▲ PLACE BET' : '▼ PASS'}</div>
                  {evPositive && (
                    <button onClick={logBet} disabled={!gameDescription.trim()} style={{ marginTop: 12, width: '100%', padding: '11px 0', background: 'transparent', border: `2px solid ${gameDescription.trim() ? '#007a4d' : '#d0d0d0'}`, color: gameDescription.trim() ? '#007a4d' : '#ccc', fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', cursor: gameDescription.trim() ? 'pointer' : 'default' }}>
                      + Log Bet to Pending
                    </button>
                  )}
                </>
              ) : (
                <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>Enter your odds above for EV and Kelly sizing</div>
              )}
            </>
          )}
        </div>
      </div>

      {pendingBets.length > 0 && (
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #007a4d' }}>
            <span style={{ fontSize: 13, letterSpacing: 2, color: '#007a4d', textTransform: 'uppercase', fontWeight: '700' }}>Pending Bets ({pendingBets.length})</span>
            <button onClick={() => setPendingBets([])} style={{ background: '#fff', border: '1px solid #d0d0d0', color: '#888', fontFamily: "'Courier New', monospace", fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>Clear All</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Game', 'Side', 'Market', 'Odds', 'Stake', ''].map(h => <th key={h} style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', textAlign: 'left', padding: '0 8px 10px 0', fontWeight: '600' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {pendingBets.map((p, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13, color: '#888' }}>{p.gameDesc}</td>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13, color: '#1a1a1a', fontWeight: '600' }}>{p.betSide || '—'}</td>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13, color: '#888' }}>{p.market}</td>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14, color: p.odds > 0 ? '#007a4d' : '#1a1a1a', fontWeight: '700' }}>{p.odds > 0 ? `+${p.odds}` : p.odds}</td>
                  <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14, color: '#007a4d', fontWeight: '700' }}>${p.stake.toFixed(2)}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                    <button onClick={() => setPendingBets(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'transparent', border: 'none', color: '#ccc', fontFamily: "'Courier New', monospace", fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 13, color: '#888' }}>
            Total exposure: <span style={{ color: '#1a1a1a', fontWeight: '700', marginLeft: 8 }}>${pendingBets.reduce((s, p) => s + p.stake, 0).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
