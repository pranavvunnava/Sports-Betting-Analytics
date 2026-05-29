import { useState, useMemo, useEffect } from 'react';

const SPORTS  = ['NBA', 'NFL', 'MLB'];
const MARKETS = ['Moneyline', 'Spread', 'Total', 'First Quarter', 'Player Prop'];
const RESULTS = ['Pending', 'Win', 'Loss', 'Push'];
const INIT_BANKROLL = 250;
const STORAGE_KEY  = 'edgelab_bets';
const PROMOS_KEY   = 'edgelab_promotions';

const promoLabel = p => `${p.book} — ${p.type} ${p.type === 'Profit Boost' ? p.value + '%' : '$' + p.value}`;

const loadPromos = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(PROMOS_KEY) || '[]');
    return raw.filter(p => p.book && p.book.trim() && +p.value > 0);
  } catch { return []; }
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const decOdds  = o => { const n = +o; if (!n || isNaN(n)) return 1; return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1; };
const calcPL   = (result, stake, odds) => {
  const s = +stake;
  if (!s) return null;
  if (result === 'Win')  return +((decOdds(odds) - 1) * s).toFixed(2);
  if (result === 'Loss') return -Math.abs(s);
  if (result === 'Push') return 0;
  return null;
};
const fmtOdds = n => { const v = +n; return (!v || isNaN(v)) ? '—' : v > 0 ? `+${v}` : `${v}`; };
const fmtSign = (n, d = 2) => n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}`;

const RC = { Win: '#007a4d', Loss: '#cc2222', Push: '#888', Pending: '#c87800' };
const RB = { Win: '#f0f9f4', Loss: '#fdf0f0', Push: '#fafafa', Pending: '#fffbf0' };

const makeDraft = () => ({
  date: todayStr(), sport: 'NBA', market: 'Moneyline',
  book: '', side: '', odds: '', stake: '', fairOdds: '',
  evPct: '', kellyRec: '', promoKey: '', result: 'Pending',
});

function Label({ children }) {
  return <div style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 6, fontWeight: '600' }}>{children}</div>;
}
function SectionHeader({ children }) {
  return <div style={{ fontSize: 13, letterSpacing: 2, color: '#007a4d', textTransform: 'uppercase', fontWeight: '700', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #007a4d' }}>{children}</div>;
}
function Input({ value, onChange, placeholder, style, type }) {
  return (
    <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
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
function StatBox({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', padding: '16px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: '700', color: color || '#1a1a1a' }}>{value}</div>
    </div>
  );
}

function BankrollChart({ points }) {
  if (points.length < 2) {
    return (
      <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', padding: '32px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>
        No settled bets yet
      </div>
    );
  }
  const W = 600, H = 130;
  const PAD = { top: 14, right: 20, bottom: 28, left: 54 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;
  const minV  = Math.min(...points), maxV = Math.max(...points);
  const range = maxV - minV || 1;
  const xOf   = i => PAD.left + (i / (points.length - 1)) * cW;
  const yOf   = v => PAD.top  + (1 - (v - minV) / range) * cH;
  const poly  = points.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const lastV    = points[points.length - 1];
  const lineCol  = lastV >= INIT_BANKROLL ? '#007a4d' : '#cc2222';
  const initY    = yOf(INIT_BANKROLL);
  const showInit = initY >= PAD.top && initY <= PAD.top + cH;
  const yTicks   = [minV, (minV + maxV) / 2, maxV];
  return (
    <div style={{ background: '#fafafa', border: '1px solid #e8e8e8' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {showInit && <line x1={PAD.left} y1={initY} x2={PAD.left + cW} y2={initY} stroke="#e0e0e0" strokeWidth="1" strokeDasharray="5 4" />}
        {yTicks.map(v => (
          <text key={v} x={PAD.left - 8} y={yOf(v) + 4} textAnchor="end" style={{ fill: '#aaa', fontSize: 9, fontFamily: 'Courier New' }}>${v.toFixed(0)}</text>
        ))}
        <polyline points={poly} fill="none" stroke={lineCol} strokeWidth="1.5" />
        <circle cx={xOf(0)}                cy={yOf(points[0])} r={2.5} fill="#ccc" />
        <circle cx={xOf(points.length - 1)} cy={yOf(lastV)}    r={3.5} fill={lineCol} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 20px 10px', fontSize: 11, letterSpacing: 1 }}>
        <span style={{ color: '#bbb' }}>Start ${INIT_BANKROLL}</span>
        <span style={{ color: lineCol, fontWeight: '700' }}>Current ${lastV.toFixed(2)} ({lastV >= INIT_BANKROLL ? '+' : ''}{(lastV - INIT_BANKROLL).toFixed(2)})</span>
      </div>
    </div>
  );
}

export default function TrackerTab() {
  const [bets, setBets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [draft,        setDraft]        = useState(makeDraft);
  const [activePromos, setActivePromos] = useState(loadPromos);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  useEffect(() => { setActivePromos(loadPromos()); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(bets)); }, [bets]);

  const selectedPromo = activePromos.find(p => promoLabel(p) === draft.promoKey) || null;

  const addBet = () => {
    if (!draft.odds || !draft.stake) return;
    const clvVal = (draft.odds && draft.fairOdds && +draft.fairOdds !== 0) ? +(+draft.odds - +draft.fairOdds).toFixed(0) : null;
    setBets(prev => [{
      id: Date.now(), date: draft.date, sport: draft.sport, market: draft.market,
      book: draft.book, side: draft.side, odds: +draft.odds, stake: +draft.stake,
      fairOdds: draft.fairOdds ? +draft.fairOdds : null,
      evPct: draft.evPct ? +draft.evPct : null,
      kellyRec: draft.kellyRec ? +draft.kellyRec : null,
      promoName: selectedPromo ? promoLabel(selectedPromo) : null,
      promoValue: selectedPromo ? +selectedPromo.value : null,
      promoType: selectedPromo ? selectedPromo.type : null,
      result: draft.result, profitLoss: calcPL(draft.result, draft.stake, draft.odds), clv: clvVal,
    }, ...prev]);
    setDraft(makeDraft());
  };

  const updateResult = (id, result) =>
    setBets(prev => prev.map(b => b.id === id ? { ...b, result, profitLoss: calcPL(result, b.stake, b.odds) } : b));
  const updateCLV  = (id, val) =>
    setBets(prev => prev.map(b => b.id === id ? { ...b, clv: val === '' ? null : +val } : b));
  const deleteBet  = id => setBets(prev => prev.filter(b => b.id !== id));

  const { stats, bankrollPoints, clvAnalysis } = useMemo(() => {
    const wins    = bets.filter(b => b.result === 'Win').length;
    const losses  = bets.filter(b => b.result === 'Loss').length;
    const pushes  = bets.filter(b => b.result === 'Push').length;
    const settled = bets.filter(b => b.result !== 'Pending');
    const totalStaked = bets.reduce((s, b) => s + (b.stake || 0), 0);
    const totalPL     = settled.reduce((s, b) => s + (b.profitLoss || 0), 0);
    const roi         = totalStaked > 0 ? totalPL / totalStaked * 100 : null;
    const winRate     = (wins + losses) > 0 ? wins / (wins + losses) * 100 : null;
    const evBets      = bets.filter(b => b.evPct != null);
    const avgEV       = evBets.length  > 0 ? evBets.reduce((s, b) => s + b.evPct, 0)  / evBets.length  : null;
    const clvBets     = bets.filter(b => b.clv  != null);
    const avgCLV      = clvBets.length > 0 ? clvBets.reduce((s, b) => s + b.clv,   0) / clvBets.length : null;
    let br = INIT_BANKROLL;
    const bankrollPoints = [INIT_BANKROLL];
    [...bets].reverse().forEach(b => { if (b.profitLoss != null) br = +(br + b.profitLoss).toFixed(2); bankrollPoints.push(br); });
    const beaten = clvBets.filter(b => b.clv > 0);
    const clvAnalysis = {
      count: clvBets.length, beatCount: beaten.length,
      beatPct: clvBets.length > 0 ? beaten.length / clvBets.length * 100 : null,
      avgCLV,
      avgPositiveCLV: beaten.length > 0 ? beaten.reduce((s, b) => s + b.clv, 0) / beaten.length : null,
    };
    return { stats: { wins, losses, pushes, totalStaked, totalPL, roi, winRate, avgEV, avgCLV }, bankrollPoints, clvAnalysis };
  }, [bets]);

  const s = {
    root:    { fontFamily: "'Courier New', monospace", color: '#1a1a1a' },
    section: { marginBottom: 36 },
    th: { fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', textAlign: 'left', padding: '0 10px 10px 0', fontWeight: '600', whiteSpace: 'nowrap' },
    td: { padding: '7px 10px 7px 0', verticalAlign: 'middle', whiteSpace: 'nowrap' },
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'transparent' },
  };

  const canAdd = draft.odds && draft.stake;

  return (
    <div style={s.root}>

      <div style={s.section}>
        <SectionHeader>Log a Bet</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <div><Label>Date</Label><Input type="date" value={draft.date} onChange={v => set('date', v)} /></div>
          <div><Label>Sport</Label><Select value={draft.sport} onChange={v => set('sport', v)} options={SPORTS} /></div>
          <div><Label>Market</Label><Select value={draft.market} onChange={v => set('market', v)} options={MARKETS} /></div>
          <div><Label>Book</Label><Input value={draft.book} onChange={v => set('book', v)} placeholder="e.g. FanDuel" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <div><Label>Team / Side</Label><Input value={draft.side} onChange={v => set('side', v)} placeholder="e.g. Lakers" /></div>
          <div><Label>Your Odds</Label><Input value={draft.odds} onChange={v => set('odds', v)} placeholder="-128" /></div>
          <div><Label>Stake ($)</Label><Input value={draft.stake} onChange={v => set('stake', v)} placeholder="10.00" type="number" /></div>
          <div><Label>Result</Label><Select value={draft.result} onChange={v => set('result', v)} options={RESULTS} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div><Label>Fair Odds</Label><Input value={draft.fairOdds} onChange={v => set('fairOdds', v)} placeholder="-133" /></div>
          <div><Label>EV %</Label><Input value={draft.evPct} onChange={v => set('evPct', v)} placeholder="1.67" type="number" /></div>
          <div><Label>Kelly Rec ($)</Label><Input value={draft.kellyRec} onChange={v => set('kellyRec', v)} placeholder="5.20" type="number" /></div>
          <div>
            <Label>Promo Used</Label>
            {activePromos.length === 0 ? (
              <div style={{ fontSize: 13, color: '#bbb', padding: '9px 0' }}>Add promos in Promotions tab</div>
            ) : (
              <>
                <select value={draft.promoKey} onChange={e => set('promoKey', e.target.value)} style={{ background: '#fff', border: '1px solid #d0d0d0', color: draft.promoKey ? '#1a1a1a' : '#aaa', fontFamily: "'Courier New', monospace", fontSize: 13, padding: '8px 10px', outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                  <option value="">No Promo</option>
                  {activePromos.map(p => { const lbl = promoLabel(p); return <option key={lbl} value={lbl}>{lbl}</option>; })}
                </select>
                {selectedPromo && <div style={{ fontSize: 11, color: '#007a4d', marginTop: 5, fontWeight: '600' }}>✓ {selectedPromo.type === 'Profit Boost' ? `${selectedPromo.value}% boost` : `$${selectedPromo.value} ${selectedPromo.type.toLowerCase()}`}</div>}
              </>
            )}
          </div>
        </div>
        <button onClick={addBet} disabled={!canAdd} style={{ width: '100%', padding: '14px 0', background: canAdd ? '#1a1a1a' : '#f0f0f0', border: 'none', color: canAdd ? '#fff' : '#bbb', fontFamily: "'Courier New', monospace", fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', cursor: canAdd ? 'pointer' : 'default' }}>
          + Add Bet
        </button>
      </div>

      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #007a4d' }}>
          <span style={{ fontSize: 13, letterSpacing: 2, color: '#007a4d', textTransform: 'uppercase', fontWeight: '700' }}>Bet History ({bets.length})</span>
          {bets.length > 0 && (
            <button onClick={() => { if (window.confirm('Delete all bets?')) setBets([]); }} style={{ background: '#fff', border: '1px solid #d0d0d0', color: '#888', fontFamily: "'Courier New', monospace", fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>
              Clear All
            </button>
          )}
        </div>
        {bets.length === 0 ? (
          <div style={{ color: '#ccc', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No bets logged yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>{['Date', 'Game', 'Book', 'Odds', 'Stake', 'Fair', 'EV %', 'Promo', 'Result', 'P / L', 'CLV', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {bets.map(b => {
                  const rc = RC[b.result];
                  const rb = RB[b.result];
                  return (
                    <tr key={b.id} style={{ background: rb, borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ ...s.td, fontSize: 12, color: '#aaa' }}>{b.date}</td>
                      <td style={{ ...s.td, maxWidth: 160 }}>
                        <div style={{ fontSize: 12, color: '#aaa' }}>{b.sport} · {b.market}</div>
                        <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: '700' }}>{b.side || '—'}</div>
                      </td>
                      <td style={{ ...s.td, fontSize: 13, color: '#888' }}>{b.book || '—'}</td>
                      <td style={{ ...s.td, fontSize: 14, fontWeight: '700', color: b.odds > 0 ? '#007a4d' : '#1a1a1a' }}>{fmtOdds(b.odds)}</td>
                      <td style={{ ...s.td, fontSize: 13 }}>${Number(b.stake).toFixed(2)}</td>
                      <td style={{ ...s.td, fontSize: 13, color: '#aaa' }}>{fmtOdds(b.fairOdds)}</td>
                      <td style={{ ...s.td, fontSize: 13, color: b.evPct > 0 ? '#007a4d' : b.evPct < 0 ? '#cc2222' : '#aaa' }}>{b.evPct != null ? fmtSign(b.evPct) + '%' : '—'}</td>
                      <td style={{ ...s.td, maxWidth: 140 }}>
                        {b.promoName
                          ? <span style={{ fontSize: 11, color: '#007a4d', fontWeight: '600', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }} title={b.promoName}>{b.promoName}</span>
                          : <span style={{ fontSize: 13, color: '#ccc' }}>—</span>}
                      </td>
                      <td style={s.td}>
                        <select value={b.result} onChange={e => updateResult(b.id, e.target.value)} style={{ background: '#fff', border: `1px solid ${rc}66`, color: rc, fontWeight: '700', fontFamily: "'Courier New', monospace", fontSize: 12, padding: '4px 6px', outline: 'none', cursor: 'pointer' }}>
                          {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={{ ...s.td, fontSize: 14, fontWeight: '700', color: b.profitLoss > 0 ? '#007a4d' : b.profitLoss < 0 ? '#cc2222' : '#aaa' }}>{b.profitLoss != null ? fmtSign(b.profitLoss, 2) : '—'}</td>
                      <td style={s.td}>
                        <input type="number" value={b.clv ?? ''} onChange={e => updateCLV(b.id, e.target.value)} placeholder="—" style={{ background: '#fff', border: '1px solid #d0d0d0', color: b.clv > 0 ? '#007a4d' : b.clv < 0 ? '#cc2222' : '#888', fontFamily: "'Courier New', monospace", fontSize: 13, padding: '4px 6px', outline: 'none', width: 60 }} />
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', paddingRight: 0 }}>
                        <button onClick={() => deleteBet(b.id)} style={{ background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={s.section}>
        <SectionHeader>Performance Stats</SectionHeader>
        <div style={{ ...s.statGrid, marginBottom: 24 }}>
          <StatBox label="Total Bets"  value={bets.length} />
          <StatBox label="Record"      value={`${stats.wins}-${stats.losses}-${stats.pushes}`} />
          <StatBox label="Win Rate"    value={stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : '—'} color={stats.winRate > 52 ? '#007a4d' : stats.winRate < 48 ? '#cc2222' : '#1a1a1a'} />
          <StatBox label="Total Staked" value={`$${stats.totalStaked.toFixed(2)}`} />
          <StatBox label="Total P / L"  value={stats.totalPL !== 0 ? fmtSign(stats.totalPL) : '$0.00'} color={stats.totalPL > 0 ? '#007a4d' : stats.totalPL < 0 ? '#cc2222' : '#1a1a1a'} />
          <StatBox label="ROI"          value={stats.roi != null ? fmtSign(stats.roi) + '%' : '—'} color={stats.roi > 0 ? '#007a4d' : stats.roi < 0 ? '#cc2222' : '#1a1a1a'} />
          <StatBox label="Avg EV %"     value={stats.avgEV != null ? fmtSign(stats.avgEV) + '%' : '—'} color={stats.avgEV > 0 ? '#007a4d' : stats.avgEV < 0 ? '#cc2222' : '#1a1a1a'} />
          <StatBox label="Avg CLV"      value={stats.avgCLV != null ? fmtSign(stats.avgCLV, 1) : '—'} color={stats.avgCLV > 0 ? '#007a4d' : stats.avgCLV < 0 ? '#cc2222' : '#1a1a1a'} />
        </div>
        <div style={{ fontSize: 12, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 10, fontWeight: '600' }}>Bankroll Curve</div>
        <BankrollChart points={bankrollPoints} />
      </div>

      <div style={s.section}>
        <SectionHeader>CLV Analysis</SectionHeader>
        {clvAnalysis.count === 0 ? (
          <div style={{ color: '#bbb', fontSize: 13, padding: '16px 0' }}>Enter closing line values in the CLV column above</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              <StatBox label="Bets with CLV"    value={clvAnalysis.count} />
              <StatBox label="Beat Closing Line" value={`${clvAnalysis.beatCount} / ${clvAnalysis.count}`} color="#007a4d" />
              <StatBox label="Beat CLV %"        value={clvAnalysis.beatPct != null ? `${clvAnalysis.beatPct.toFixed(1)}%` : '—'} color={clvAnalysis.beatPct > 55 ? '#007a4d' : clvAnalysis.beatPct < 45 ? '#cc2222' : '#c87800'} />
              <StatBox label="Avg CLV (cents)"   value={clvAnalysis.avgCLV != null ? fmtSign(clvAnalysis.avgCLV, 1) : '—'} color={clvAnalysis.avgCLV > 0 ? '#007a4d' : clvAnalysis.avgCLV < 0 ? '#cc2222' : '#1a1a1a'} />
              <StatBox label="Avg Positive CLV"  value={clvAnalysis.avgPositiveCLV != null ? `+${clvAnalysis.avgPositiveCLV.toFixed(1)}` : '—'} color="#007a4d" />
              <StatBox label="CLV Edge"          value={clvAnalysis.beatPct > 55 ? 'STRONG' : clvAnalysis.beatPct > 45 ? 'NEUTRAL' : 'WEAK'} color={clvAnalysis.beatPct > 55 ? '#007a4d' : clvAnalysis.beatPct > 45 ? '#c87800' : '#cc2222'} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
