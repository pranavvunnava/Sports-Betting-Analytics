import { useState, useMemo } from 'react';
import { detectArbitrage, optimalStakes, detectMiddle } from './engine';
import { getApiKey, fetchAllOdds, bestOddsForMarket } from './api';

const r2 = n => Math.round(n * 100) / 100;
const MARKET_LABELS = { h2h: 'Moneyline', spreads: 'Spread', totals: 'Total' };

const findBreakEven = stake => {
  const stk = stake > 0 ? stake : 100;
  let lo = 0, hi = 50;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const t   = detectMiddle('', -1, '', 1 + mid, 'Spread', stk, stk);
    if (!t.hasMiddle || t.expectedValue < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};

function findLiveArbs(games) {
  const arbs = [];
  for (const game of games) {
    for (const mktKey of ['h2h', 'spreads', 'totals']) {
      const legs = bestOddsForMarket(game, mktKey);
      if (legs.length < 2) continue;
      const arb = detectArbitrage(legs.map(l => l.odds));
      if (arb.isArb) {
        arbs.push({
          game:   `${game.away_team} @ ${game.home_team}`,
          sport:  game.sportLabel,
          market: mktKey,
          legs,
          profitPct:  arb.profitPct,
          impliedSum: arb.impliedSum,
        });
      }
    }
  }
  return arbs.sort((a, b) => b.profitPct - a.profitPct);
}

const makeLeg = () => ({ book: '', side: '', odds: '' });

function Label({ children }) {
  return <div style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 6, fontWeight: '600' }}>{children}</div>;
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 13, letterSpacing: 2, color: '#007a4d', textTransform: 'uppercase', fontWeight: '700', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #007a4d' }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, style }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a',
        fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px',
        outline: 'none', width: '100%', boxSizing: 'border-box', ...style,
      }}
    />
  );
}

export default function ArbTab() {
  const [scanning,  setScanning]  = useState(false);
  const [scanError, setScanError] = useState('');
  const [liveArbs,  setLiveArbs]  = useState([]);
  const [scanned,   setScanned]   = useState(false);

  const [legs,     setLegs]     = useState([makeLeg(), makeLeg()]);
  const [bankroll, setBankroll] = useState('250');

  const [mBook1,  setMBook1]  = useState('');
  const [mLine1,  setMLine1]  = useState('');
  const [mBook2,  setMBook2]  = useState('');
  const [mLine2,  setMLine2]  = useState('');
  const [mMarket, setMMarket] = useState('Spread');
  const [mStake,  setMStake]  = useState('100');
  const [mOdds,   setMOdds]   = useState('-110');

  const hasApiKey = !!getApiKey();

  const handleScan = async () => {
    setScanning(true);
    setScanError('');
    setLiveArbs([]);
    try {
      const games = await fetchAllOdds();
      setLiveArbs(findLiveArbs(games));
      setScanned(true);
    } catch (e) {
      setScanError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const fillFromLive = arb => {
    setLegs(arb.legs.map(l => ({ book: l.book, side: l.side, odds: String(l.odds) })));
    document.getElementById('manual-entry')?.scrollIntoView({ behavior: 'smooth' });
  };

  const addLeg    = () => setLegs(prev => [...prev, makeLeg()]);
  const removeLeg = i  => setLegs(prev => prev.filter((_, idx) => idx !== i));
  const updateLeg = (i, field, value) =>
    setLegs(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });

  const results = useMemo(() => {
    try {
      const valid = legs.map((l, i) => ({ ...l, idx: i })).filter(l => l.odds !== '' && !isNaN(+l.odds) && +l.odds !== 0);
      if (valid.length < 2) return null;
      const oddsList        = valid.map(l => +l.odds);
      const arb             = detectArbitrage(oddsList);
      const bl              = +bankroll || 250;
      const stakes          = optimalStakes(oddsList, bl);
      const guaranteedProfit = arb.isArb ? r2(bl * arb.profitPct / 100) : 0;
      const payout           = arb.isArb ? r2(bl + guaranteedProfit) : null;
      return { arb, stakes, valid, bl, guaranteedProfit, payout };
    } catch (_) { return null; }
  }, [legs, bankroll]);

  const middleResult = useMemo(() => {
    const l1  = parseFloat(mLine1);
    const l2  = parseFloat(mLine2);
    const stk = Math.max(1, +mStake || 100);
    if (!mLine1 || !mLine2 || isNaN(l1) || isNaN(l2)) return null;
    const res = detectMiddle(mBook1, l1, mBook2, l2, mMarket, stk, stk);
    let rawWindow = null;
    if (mMarket === 'Spread') {
      if      (l1 < 0 && l2 > 0) rawWindow = +(l2 - Math.abs(l1)).toFixed(2);
      else if (l1 > 0 && l2 < 0) rawWindow = +(l1 - Math.abs(l2)).toFixed(2);
    } else {
      rawWindow = +Math.abs(l2 - l1).toFixed(2);
    }
    return { ...res, rawWindow, breakEvenWindow: findBreakEven(stk) };
  }, [mBook1, mLine1, mBook2, mLine2, mMarket, mStake]);

  const hasResults  = results !== null;
  const isArb       = hasResults && results.arb.isArb;
  const impliedPct  = hasResults ? (results.arb.impliedSum * 100).toFixed(4) : null;
  const distancePct = hasResults ? ((results.arb.impliedSum - 1) * 100).toFixed(4) : null;

  const s = {
    root:    { fontFamily: "'Courier New', monospace", color: '#1a1a1a' },
    section: { marginBottom: 36 },
    th: { fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', textAlign: 'left', padding: '0 8px 12px 0', fontWeight: '600' },
    td: { padding: '5px 8px 5px 0', verticalAlign: 'middle' },
    btnAdd:    { background: '#fff', border: '1px solid #007a4d', color: '#007a4d', fontFamily: "'Courier New', monospace", fontSize: 16, padding: '4px 14px', cursor: 'pointer' },
    btnRemove: { background: '#fff', border: '1px solid #cc2222', color: '#cc2222', fontFamily: "'Courier New', monospace", fontSize: 16, padding: '4px 10px', cursor: 'pointer' },
    resultsBox: { background: '#f4f4f4', border: '1px solid #e0e0e0', padding: '28px 32px' },
    banner: ok => ({
      textAlign: 'center', fontSize: 24, fontWeight: '700', letterSpacing: 6,
      color: ok ? '#007a4d' : '#cc2222',
      border: `2px solid ${ok ? '#007a4d' : '#cc2222'}`,
      background: ok ? '#f0f9f4' : '#fdf0f0',
      padding: '18px 0', marginBottom: 28,
    }),
    statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: '#e0e0e0', border: '1px solid #e0e0e0', marginBottom: 28 },
    statCell: { background: '#fff', padding: '18px 20px', textAlign: 'center' },
    stakeTable: { width: '100%', borderCollapse: 'collapse' },
    stakeTh: { fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', textAlign: 'left', padding: '8px 0', borderBottom: '1px solid #e0e0e0', fontWeight: '600' },
    stakeTd: { padding: '12px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14 },
  };

  return (
    <div style={s.root}>

      {/* Live Scan */}
      <div style={s.section}>
        <div style={{ fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 }}>Live Arb Scan</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>NBA, NFL, MLB across all US sportsbooks</div>

        {!hasApiKey ? (
          <div style={{ fontSize: 13, color: '#aaa', padding: '14px 18px', border: '1px solid #e8e8e8', background: '#fafafa' }}>
            Add an Odds API key in Settings to enable live scanning
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <button
                onClick={handleScan}
                disabled={scanning}
                style={{
                  background: scanning ? '#f0f0f0' : '#1a1a1a', border: 'none',
                  color: scanning ? '#aaa' : '#fff',
                  fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: 2,
                  textTransform: 'uppercase', padding: '10px 24px', cursor: scanning ? 'default' : 'pointer',
                }}
              >
                {scanning ? 'Scanning...' : 'Scan Live Odds'}
              </button>
              {scanError && <span style={{ fontSize: 13, color: '#cc2222' }}>{scanError}</span>}
            </div>

            {scanned && liveArbs.length === 0 && !scanning && (
              <div style={{ fontSize: 13, color: '#aaa', padding: '14px 18px', border: '1px solid #e8e8e8', background: '#fafafa' }}>
                No arbs found in current markets
              </div>
            )}

            {liveArbs.length > 0 && (
              <div style={{ border: '1px solid #e0e0e0' }}>
                <div style={{ padding: '10px 16px', background: '#f4f4f4', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: 24 }}>
                  {[['Game', 3], ['Market', 1], ['Profit', 1], ['Legs', 4], ['', 1]].map(([h, flex]) => (
                    <span key={h} style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', fontWeight: '600', flex }}>{h}</span>
                  ))}
                </div>
                {liveArbs.map((arb, i) => (
                  <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 24, alignItems: 'flex-start', background: '#fff' }}>
                    <div style={{ flex: 3 }}>
                      <div style={{ fontSize: 14, color: '#1a1a1a', fontWeight: '600', marginBottom: 2 }}>{arb.game}</div>
                      <div style={{ fontSize: 12, color: '#aaa' }}>{arb.sport}</div>
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: '#666', paddingTop: 2 }}>{MARKET_LABELS[arb.market] || arb.market}</div>
                    <div style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#007a4d', paddingTop: 2 }}>+{arb.profitPct.toFixed(4)}%</div>
                    <div style={{ flex: 4 }}>
                      {arb.legs.map((leg, j) => (
                        <div key={j} style={{ fontSize: 12, color: '#888', marginBottom: 3 }}>
                          <span style={{ color: '#aaa' }}>{leg.book}</span>
                          {' · '}
                          <span style={{ color: '#1a1a1a', fontWeight: '600' }}>{leg.side}</span>
                          {' · '}
                          <span style={{ color: leg.odds > 0 ? '#007a4d' : '#1a1a1a', fontWeight: '700' }}>
                            {leg.odds > 0 ? `+${leg.odds}` : leg.odds}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <button
                        onClick={() => fillFromLive(arb)}
                        style={{ background: '#fff', border: '1px solid #d0d0d0', color: '#666', fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', padding: '5px 10px', cursor: 'pointer' }}
                      >
                        Fill
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #e8e8e8', margin: '8px 0 40px' }} />

      {/* Manual Entry */}
      <div id="manual-entry">
        <div style={s.section}>
          <div style={{ fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 }}>Arbitrage Scanner</div>
          <div style={{ fontSize: 13, color: '#888' }}>Enter odds from different books for the same event</div>
        </div>

        <div style={s.section}>
          <SectionHeader>Legs</SectionHeader>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['#', 'Book', 'Side / Team', 'American Odds', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {legs.map((leg, i) => (
                <tr key={i}>
                  <td style={{ ...s.td, width: '4%', color: '#ccc', fontSize: 13 }}>{i + 1}</td>
                  <td style={{ ...s.td, width: '28%' }}><Input value={leg.book} onChange={v => updateLeg(i, 'book', v)} placeholder="e.g. Pinnacle" /></td>
                  <td style={{ ...s.td, width: '28%' }}><Input value={leg.side} onChange={v => updateLeg(i, 'side', v)} placeholder="e.g. Lakers" /></td>
                  <td style={{ ...s.td, width: '28%' }}><Input value={leg.odds} onChange={v => updateLeg(i, 'odds', v)} placeholder="-135" /></td>
                  <td style={{ ...s.td, width: '8%', textAlign: 'right' }}>
                    {legs.length > 2 && <button style={s.btnRemove} onClick={() => removeLeg(i)}>−</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}><button style={s.btnAdd} onClick={addLeg}>+ Add Leg</button></div>
        </div>

        <div style={{ ...s.section, maxWidth: 240 }}>
          <Label>Bankroll ($)</Label>
          <Input value={bankroll} onChange={setBankroll} placeholder="250" />
        </div>

        <div style={s.section}>
          <SectionHeader>Scanner Output</SectionHeader>
          <div style={s.resultsBox}>
            {!hasResults ? (
              <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Enter odds for at least two legs</div>
            ) : (
              <>
                <div style={s.banner(isArb)}>{isArb ? '✓ ARB FOUND' : '✗ NO ARB'}</div>
                {isArb ? (
                  <>
                    <div style={s.statGrid}>
                      {[
                        { label: 'Profit %',           value: `+${results.arb.profitPct.toFixed(4)}%`,  color: '#007a4d' },
                        { label: 'Guaranteed Profit',  value: `$${results.guaranteedProfit.toFixed(2)}`, color: '#007a4d' },
                        { label: 'Guaranteed Payout',  value: `$${results.payout.toFixed(2)}`,           color: '#1a1a1a' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={s.statCell}>
                          <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' }}>{label}</div>
                          <div style={{ fontSize: 22, fontWeight: '700', color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 12, fontWeight: '600' }}>
                      Optimal Stakes — total ${results.bl.toFixed(2)}
                    </div>
                    <table style={s.stakeTable}>
                      <thead>
                        <tr>{['Book', 'Side', 'Odds', 'Bet Amount', 'Payout'].map(h => <th key={h} style={s.stakeTh}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {results.valid.map((leg, i) => {
                          const stake   = results.stakes[i];
                          const decimal = leg.odds > 0 ? leg.odds / 100 + 1 : 100 / Math.abs(leg.odds) + 1;
                          const payout  = r2(stake * decimal);
                          return (
                            <tr key={i}>
                              <td style={{ ...s.stakeTd, color: '#1a1a1a' }}>{leg.book || '—'}</td>
                              <td style={{ ...s.stakeTd, color: '#1a1a1a' }}>{leg.side || '—'}</td>
                              <td style={{ ...s.stakeTd, color: +leg.odds > 0 ? '#007a4d' : '#1a1a1a', fontWeight: '700' }}>{+leg.odds > 0 ? `+${+leg.odds}` : `${+leg.odds}`}</td>
                              <td style={{ ...s.stakeTd, color: '#007a4d', fontWeight: '700' }}>${stake.toFixed(2)}</td>
                              <td style={{ ...s.stakeTd, color: '#888' }}>${payout.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <>
                    <div style={s.statGrid}>
                      {[
                        { label: 'Implied Sum',     value: `${impliedPct}%`,               color: '#cc2222' },
                        { label: 'Distance to Arb', value: `+${distancePct}%`,             color: '#cc2222' },
                        { label: 'Book Margin',     value: `${results.arb.margin.toFixed(4)}%`, color: '#999' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={s.statCell}>
                          <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' }}>{label}</div>
                          <div style={{ fontSize: 22, fontWeight: '700', color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 13, color: '#bbb', marginTop: 8 }}>Implied sum must be below 100%</div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Middle Finder */}
      <hr style={{ border: 'none', borderTop: '1px solid #e8e8e8', margin: '8px 0 40px' }} />

      <div style={s.section}>
        <div style={{ fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 }}>Middle Finder</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 28 }}>Find windows where both bets can win</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <div><Label>Book 1</Label><Input value={mBook1} onChange={setMBook1} placeholder="e.g. DraftKings" /></div>
          <div><Label>Book 1 Line</Label><Input value={mLine1} onChange={setMLine1} placeholder="-7.5" /></div>
          <div><Label>Book 2</Label><Input value={mBook2} onChange={setMBook2} placeholder="e.g. FanDuel" /></div>
          <div><Label>Book 2 Line</Label><Input value={mLine2} onChange={setMLine2} placeholder="+8.5" /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          <div>
            <Label>Market</Label>
            <select value={mMarket} onChange={e => setMMarket(e.target.value)} style={{ background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a', fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px', outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
              <option value="Spread">Spread</option>
              <option value="Total">Total</option>
            </select>
          </div>
          <div><Label>Stake per Side ($)</Label><Input value={mStake} onChange={setMStake} placeholder="100" /></div>
          <div><Label>Vig Odds (per side)</Label><Input value={mOdds} onChange={setMOdds} placeholder="-110" /></div>
        </div>

        <div style={s.resultsBox}>
          {!middleResult ? (
            <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Enter lines from two books</div>
          ) : middleResult.hasMiddle ? (
            <>
              <div style={s.banner(true)}>✓ MIDDLE FOUND</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#e0e0e0', border: '1px solid #e0e0e0', marginBottom: 28 }}>
                {[
                  { label: 'Window',          value: `${middleResult.middleWindow} pts`,                       color: '#1a1a1a' },
                  { label: 'Hit Probability', value: `${(middleResult.hitProbability * 100).toFixed(2)}%`,     color: '#c87800' },
                  { label: 'Worst Case',      value: `-$${Math.abs(middleResult.worstCaseLoss).toFixed(2)}`,   color: '#cc2222' },
                  { label: 'Best Case',       value: `+$${middleResult.bestCaseProfit.toFixed(2)}`,            color: '#007a4d' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={s.statCell}>
                    <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: '700', color }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 10, fontWeight: '600' }}>Expected Value</div>
                <div style={{ fontSize: 28, fontWeight: '700', color: middleResult.expectedValue >= 0 ? '#007a4d' : '#cc2222' }}>
                  {middleResult.expectedValue >= 0 ? '+' : ''}${middleResult.expectedValue.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>per ${(+mStake || 100).toFixed(0)} per side at {mOdds || '-110'}</div>
              </div>
            </>
          ) : (
            <>
              <div style={s.banner(false)}>✗ NO MIDDLE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: '#e0e0e0', border: '1px solid #e0e0e0', marginBottom: 24 }}>
                {[
                  { label: 'Current Gap',      value: middleResult.rawWindow === null ? 'N/A' : `${middleResult.rawWindow >= 0 ? '' : '−'}${Math.abs(middleResult.rawWindow).toFixed(1)} pts`, color: '#cc2222' },
                  { label: 'To Open Middle',   value: middleResult.rawWindow === null ? 'N/A' : middleResult.rawWindow >= 0 ? '—' : `+${Math.abs(middleResult.rawWindow).toFixed(1)} pts`, color: '#cc2222' },
                  { label: 'Break-even Window', value: `${middleResult.breakEvenWindow.toFixed(1)} pts`, color: '#999' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={s.statCell}>
                    <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: '700', color }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, color: '#bbb' }}>
                {middleResult.rawWindow === null
                  ? 'Lines are on the same side'
                  : middleResult.rawWindow <= 0
                    ? `Lines overlap by ${Math.abs(middleResult.rawWindow).toFixed(1)} pts`
                    : `Window of ${middleResult.rawWindow.toFixed(1)} pts is below break-even`}
              </div>
            </>
          )}
          {middleResult && (
            <div style={{ borderTop: '1px solid #e8e8e8', marginTop: 20, paddingTop: 12, fontSize: 12, color: '#bbb', textAlign: 'center' }}>
              Middles work best with windows of 2.5+ points
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
