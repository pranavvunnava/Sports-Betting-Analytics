import { useState, useMemo, useEffect } from 'react';
import { applyPromotion, calculateEV } from './engine';

const PROMOS_KEY  = 'edgelab_promotions';
const PROMO_TYPES = ['Profit Boost', 'Odds Boost', 'Free Bet'];
const ENGINE_TYPES = { 'Profit Boost': 'profit_boost', 'Odds Boost': 'odds_boost', 'Free Bet': 'free_bet' };

const makePending = () => ({ book: '', type: 'Profit Boost', value: '', desc: '', expiry: '' });
const r2  = n => Math.round(n * 100) / 100;
const fmt = n => n > 0 ? `+${n}` : `${n}`;

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

function Input({ value, onChange, placeholder, style, type }) {
  return (
    <input
      type={type || 'text'}
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

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a',
        fontFamily: "'Courier New', monospace", fontSize: 14, padding: '8px 10px',
        outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
      }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ResultRow({ label, value, color, large }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: large ? '14px 0' : '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase', fontWeight: '600' }}>{label}</span>
      <span style={{ fontSize: large ? 20 : 15, fontWeight: '700', color: color || '#1a1a1a' }}>{value}</span>
    </div>
  );
}

export default function PromotionsTab() {
  const [promos, setPromos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PROMOS_KEY) || 'null') || [makePending()]; }
    catch { return [makePending()]; }
  });

  useEffect(() => { localStorage.setItem(PROMOS_KEY, JSON.stringify(promos)); }, [promos]);

  const addPromo    = () => setPromos(prev => [...prev, makePending()]);
  const removePromo = i  => setPromos(prev => prev.filter((_, idx) => idx !== i));
  const updatePromo = (i, field, val) =>
    setPromos(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: val }; return next; });

  const validPromos = promos.filter(p => p.book.trim() && +p.value > 0);

  const [baseOdds,    setBaseOdds]    = useState('');
  const [fairOdds,    setFairOdds]    = useState('');
  const [bankroll,    setBankroll]    = useState('250');
  const [selectedIdx, setSelectedIdx] = useState('');

  const calcResults = useMemo(() => {
    try {
      const bo = +baseOdds, fo = +fairOdds, bl = +bankroll || 250;
      if (!bo || !fo || isNaN(bo) || isNaN(fo) || bo === 0 || fo === 0) return null;
      const promo = validPromos[+selectedIdx];
      if (!promo) return null;
      const engineType  = ENGINE_TYPES[promo.type];
      const promoVal    = promo.type === 'Profit Boost' ? +promo.value / 100 : +promo.value;
      const boostedOdds = applyPromotion(bo, engineType, promoVal);
      const baseEV      = calculateEV(fo, bo);
      const boostedEV   = calculateEV(fo, boostedOdds);
      const fairProb    = 1 / (bo > 0 ? (bo / 100 + 1) : (100 / Math.abs(bo) + 1));
      const bDec        = boostedOdds > 0 ? boostedOdds / 100 + 1 : 100 / Math.abs(boostedOdds) + 1;
      const netOdds     = bDec - 1;
      const kellyPct    = Math.max(0, (fairProb * bDec - 1) / netOdds);
      const stake       = r2(kellyPct * 0.25 * bl);
      return { boostedOdds, baseEV, boostedEV, stake };
    } catch (_) { return null; }
  }, [baseOdds, fairOdds, bankroll, selectedIdx, validPromos]);

  const s = {
    root:      { fontFamily: "'Courier New', monospace", color: '#1a1a1a' },
    section:   { marginBottom: 36 },
    th:        { fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', textAlign: 'left', padding: '0 10px 12px 0', fontWeight: '600' },
    td:        { padding: '6px 10px 6px 0', verticalAlign: 'middle' },
    btnAdd:    { background: '#fff', border: '1px solid #007a4d', color: '#007a4d', fontFamily: "'Courier New', monospace", fontSize: 16, padding: '4px 14px', cursor: 'pointer' },
    btnRemove: { background: '#fff', border: '1px solid #cc2222', color: '#cc2222', fontFamily: "'Courier New', monospace", fontSize: 16, padding: '4px 10px', cursor: 'pointer' },
    resultsBox: { background: '#f4f4f4', border: '1px solid #e0e0e0', padding: '24px 28px' },
  };

  return (
    <div style={s.root}>

      <div style={s.section}>
        <SectionHeader>Active Promos</SectionHeader>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Book', 'Type', 'Value', 'Description', 'Expiry', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {promos.map((p, i) => (
              <tr key={i}>
                <td style={{ ...s.td, width: '16%' }}><Input value={p.book} onChange={v => updatePromo(i, 'book', v)} placeholder="e.g. FanDuel" /></td>
                <td style={{ ...s.td, width: '17%' }}><Select value={p.type} onChange={v => updatePromo(i, 'type', v)} options={PROMO_TYPES} /></td>
                <td style={{ ...s.td, width: '12%' }}>
                  <Input value={p.value} onChange={v => updatePromo(i, 'value', v)} placeholder={p.type === 'Profit Boost' ? '25 (%)' : '500 ($)'} type="number" />
                </td>
                <td style={{ ...s.td, width: '30%' }}><Input value={p.desc} onChange={v => updatePromo(i, 'desc', v)} placeholder="e.g. NBA moneyline only" /></td>
                <td style={{ ...s.td, width: '16%' }}><Input value={p.expiry} onChange={v => updatePromo(i, 'expiry', v)} placeholder="YYYY-MM-DD" /></td>
                <td style={{ ...s.td, width: '5%', textAlign: 'right' }}>
                  {promos.length > 1 && <button style={s.btnRemove} onClick={() => removePromo(i)}>−</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}><button style={s.btnAdd} onClick={addPromo}>+ Add Promo</button></div>
      </div>

      <div style={s.section}>
        <SectionHeader>Promo EV Calculator</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div><Label>Base Odds</Label><Input value={baseOdds} onChange={setBaseOdds} placeholder="+150" /></div>
          <div><Label>Fair Odds</Label><Input value={fairOdds} onChange={setFairOdds} placeholder="+140" /></div>
          <div><Label>Bankroll ($)</Label><Input value={bankroll} onChange={setBankroll} placeholder="250" /></div>
          <div>
            <Label>Select Promo</Label>
            <select
              value={selectedIdx}
              onChange={e => setSelectedIdx(e.target.value)}
              style={{ background: '#fff', border: '1px solid #d0d0d0', color: validPromos.length ? '#1a1a1a' : '#aaa', fontFamily: "'Courier New', monospace", fontSize: 13, padding: '8px 10px', outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}
            >
              <option value="">Select a promo</option>
              {validPromos.map((p, i) => (
                <option key={i} value={i}>{p.book} — {p.type} {p.type === 'Profit Boost' ? p.value + '%' : '$' + p.value}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={s.resultsBox}>
          {!calcResults ? (
            <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Enter base odds, fair odds, and select a promo</div>
          ) : (
            <>
              <ResultRow label="Base Odds"              value={fmt(+baseOdds)} />
              <ResultRow label="Boosted Effective Odds" value={fmt(calcResults.boostedOdds)} color="#007a4d" />
              <ResultRow label="Base EV %"              value={`${calcResults.baseEV >= 0 ? '+' : ''}${calcResults.baseEV.toFixed(4)}%`} color={calcResults.baseEV >= 0 ? '#007a4d' : '#cc2222'} />
              <ResultRow label="Boosted EV %"           value={`${calcResults.boostedEV >= 0 ? '+' : ''}${calcResults.boostedEV.toFixed(4)}%`} color={calcResults.boostedEV >= 0 ? '#007a4d' : '#cc2222'} large />
              <ResultRow label="Recommended Stake (¼ Kelly)" value={`$${calcResults.stake.toFixed(2)}`} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
