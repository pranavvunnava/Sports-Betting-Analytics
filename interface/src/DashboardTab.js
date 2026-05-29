import { useState, useMemo, useCallback } from 'react';

const STORAGE_KEY   = 'edgelab_bets';
const INIT_BANKROLL = 250;

const todayStr = () => new Date().toISOString().slice(0, 10);
const decOdds  = o => { const n = +o; if (!n || isNaN(n)) return 1; return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1; };
const calcPL   = (result, stake, odds) => { const s = +stake; if (!s) return null; if (result === 'Win') return +((decOdds(odds) - 1) * s).toFixed(2); if (result === 'Loss') return -Math.abs(s); if (result === 'Push') return 0; return null; };
const loadBets = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
const saveBets = bets => localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
const fmtOdds  = n => { const v = +n; return (!v || isNaN(v)) ? '—' : v > 0 ? `+${v}` : `${v}`; };
const fmtSign  = (n, d = 2) => n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}`;

const RC  = { Win: '#007a4d', Loss: '#cc2222', Push: '#888', Pending: '#c87800' };
const RBG = { Win: '#f0f9f4', Loss: '#fdf0f0', Push: '#fafafa', Pending: '#fffbf0' };

function Sparkline({ points, width = 220, height = 80 }) {
  if (points.length < 2) return <div style={{ color: '#ccc', fontSize: 13 }}>—</div>;
  const PAD = 4, minV = Math.min(...points), maxV = Math.max(...points);
  const rng  = maxV - minV || 1, cW = width - PAD * 2, cH = height - PAD * 2;
  const xOf  = i => PAD + (i / (points.length - 1)) * cW;
  const yOf  = v => PAD + (1 - (v - minV) / rng) * cH;
  const poly = points.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const lastV = points[points.length - 1];
  const col   = lastV >= INIT_BANKROLL ? '#007a4d' : '#cc2222';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height, display: 'block' }}>
      <polyline points={poly} fill="none" stroke={col} strokeWidth="1.5" />
      <circle cx={xOf(0)}               cy={yOf(points[0])} r={2.5} fill="#ccc" />
      <circle cx={xOf(points.length-1)} cy={yOf(lastV)}     r={3.5} fill={col} />
    </svg>
  );
}

function SectionHeader({ children }) {
  return <div style={{ fontSize: 13, letterSpacing: 2, color: '#007a4d', textTransform: 'uppercase', fontWeight: '700', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #007a4d' }}>{children}</div>;
}

function StatCard({ label, value, sub, color, large }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', padding: large ? '24px 28px' : '18px 22px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 10, fontWeight: '600' }}>{label}</div>
      <div style={{ fontSize: large ? 28 : 22, fontWeight: '700', color: color || '#1a1a1a' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default function DashboardTab() {
  const [bets, setBets] = useState(loadBets);

  const settleBet = useCallback((id, result) => {
    setBets(prev => {
      const next = prev.map(b => b.id === id ? { ...b, result, profitLoss: calcPL(result, b.stake, b.odds) } : b);
      saveBets(next);
      return next;
    });
  }, []);

  const { currentBankroll, todayPL, totalStaked, totalPL, roi, pendingBets, recentSettled, bankrollPoints, quickStats } = useMemo(() => {
    const settled = bets.filter(b => b.result !== 'Pending');
    const pending = bets.filter(b => b.result === 'Pending');
    const totalPL = settled.reduce((s, b) => s + (b.profitLoss || 0), 0);
    const currentBankroll = +(INIT_BANKROLL + totalPL).toFixed(2);
    const today   = todayStr();
    const todayPL = settled.filter(b => b.date === today).reduce((s, b) => s + (b.profitLoss || 0), 0);
    const totalStaked = bets.reduce((s, b) => s + (b.stake || 0), 0);
    const roi = totalStaked > 0 ? totalPL / totalStaked * 100 : null;
    const recentSettled = settled.slice(0, 10);
    let br = INIT_BANKROLL;
    const bankrollPoints = [INIT_BANKROLL];
    [...bets].reverse().forEach(b => { if (b.profitLoss != null) br = +(br + b.profitLoss).toFixed(2); bankrollPoints.push(br); });
    const wins = settled.filter(b => b.result === 'Win'), losses = settled.filter(b => b.result === 'Loss');
    const winRate = (wins.length + losses.length) > 0 ? wins.length / (wins.length + losses.length) * 100 : null;
    const evBets  = bets.filter(b => b.evPct != null);
    const avgEV   = evBets.length  > 0 ? evBets.reduce((s, b)  => s + b.evPct, 0) / evBets.length  : null;
    const clvBets = bets.filter(b => b.clv  != null);
    const avgCLV  = clvBets.length > 0 ? clvBets.reduce((s, b) => s + b.clv,   0) / clvBets.length : null;
    const plVals = settled.map(b => b.profitLoss).filter(v => v != null);
    const lossVals = plVals.filter(v => v < 0);
    const biggestWin  = plVals.length   > 0 ? Math.max(...plVals)   : null;
    const biggestLoss = lossVals.length > 0 ? Math.min(...lossVals) : null;
    return { currentBankroll, todayPL, totalStaked, totalPL, roi, pendingBets: pending, recentSettled, bankrollPoints, quickStats: { winRate, avgEV, avgCLV, biggestWin, biggestLoss } };
  }, [bets]);

  const s = {
    root:    { fontFamily: "'Courier New', monospace", color: '#1a1a1a' },
    section: { marginBottom: 40 },
    th: { fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', textAlign: 'left', padding: '0 12px 10px 0', fontWeight: '600', whiteSpace: 'nowrap' },
    td: { padding: '8px 12px 8px 0', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  };

  return (
    <div style={s.root}>

      <div style={s.section}>
        <SectionHeader>Bankroll Overview</SectionHeader>
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label="Current Bankroll" value={`$${currentBankroll.toFixed(2)}`} sub={`Started at $${INIT_BANKROLL}`} color={currentBankroll >= INIT_BANKROLL ? '#007a4d' : '#cc2222'} large />
          <StatCard label="Today's P / L"   value={todayPL !== 0 ? fmtSign(todayPL) : '$0.00'} color={todayPL > 0 ? '#007a4d' : todayPL < 0 ? '#cc2222' : '#1a1a1a'} large />
          <StatCard label="Total Bets"       value={bets.length} sub={`${pendingBets.length} pending`} large />
          <StatCard label="Overall ROI"      value={roi != null ? fmtSign(roi) + '%' : '—'} sub={totalStaked > 0 ? `${fmtSign(totalPL)} on $${totalStaked.toFixed(2)} staked` : 'no settled bets'} color={roi > 0 ? '#007a4d' : roi < 0 ? '#cc2222' : '#1a1a1a'} large />
        </div>
      </div>

      <div style={s.section}>
        <SectionHeader>{`Pending Bets${pendingBets.length > 0 ? ` (${pendingBets.length})` : ''}`}</SectionHeader>
        {pendingBets.length === 0 ? (
          <div style={{ color: '#ccc', fontSize: 13, padding: '16px 0' }}>No pending bets</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>{['Game', 'Book', 'Odds', 'Stake', 'EV %', 'Date', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {pendingBets.map(b => (
                  <tr key={b.id} style={{ background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ ...s.td, maxWidth: 200 }}>
                      <div style={{ fontSize: 12, color: '#aaa' }}>{b.sport} · {b.market}</div>
                      <div style={{ fontSize: 14, color: '#1a1a1a', fontWeight: '700' }}>{b.side || '—'}</div>
                    </td>
                    <td style={{ ...s.td, fontSize: 13, color: '#888' }}>{b.book || '—'}</td>
                    <td style={{ ...s.td, fontSize: 14, fontWeight: '700', color: +b.odds > 0 ? '#007a4d' : '#1a1a1a' }}>{fmtOdds(b.odds)}</td>
                    <td style={{ ...s.td, fontSize: 13 }}>${Number(b.stake).toFixed(2)}</td>
                    <td style={{ ...s.td, fontSize: 13, color: b.evPct > 0 ? '#007a4d' : b.evPct < 0 ? '#cc2222' : '#aaa' }}>{b.evPct != null ? fmtSign(b.evPct) + '%' : '—'}</td>
                    <td style={{ ...s.td, fontSize: 12, color: '#aaa' }}>{b.date}</td>
                    <td style={{ ...s.td, paddingRight: 0 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['Win', 'Loss', 'Push'].map(r => (
                          <button key={r} onClick={() => settleBet(b.id, r)} style={{ background: '#fff', border: `1px solid ${RC[r]}66`, color: RC[r], fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1, padding: '5px 9px', cursor: 'pointer', fontWeight: '600' }}
                            onMouseEnter={e => { e.currentTarget.style.background = RC[r] + '18'; e.currentTarget.style.borderColor = RC[r]; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = RC[r] + '66'; }}
                          >{r}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={s.section}>
        <SectionHeader>Recent Performance</SectionHeader>
        {recentSettled.length === 0 ? (
          <div style={{ color: '#ccc', fontSize: 13, padding: '16px 0' }}>No settled bets yet</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Date', 'Side', 'Book', 'Odds', 'Stake', 'Result', 'P / L'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {recentSettled.map(b => (
                    <tr key={b.id} style={{ background: RBG[b.result], borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ ...s.td, fontSize: 12, color: '#aaa' }}>{b.date}</td>
                      <td style={{ ...s.td, fontSize: 13, color: '#1a1a1a', fontWeight: '700' }}>{b.side || '—'}</td>
                      <td style={{ ...s.td, fontSize: 13, color: '#888' }}>{b.book || '—'}</td>
                      <td style={{ ...s.td, fontSize: 14, fontWeight: '700', color: +b.odds > 0 ? '#007a4d' : '#1a1a1a' }}>{fmtOdds(b.odds)}</td>
                      <td style={{ ...s.td, fontSize: 13 }}>${Number(b.stake).toFixed(2)}</td>
                      <td style={s.td}><span style={{ fontSize: 12, color: RC[b.result], letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' }}>{b.result}</span></td>
                      <td style={{ ...s.td, fontSize: 13, fontWeight: '700', color: b.profitLoss > 0 ? '#007a4d' : b.profitLoss < 0 ? '#cc2222' : '#aaa' }}>{b.profitLoss != null ? fmtSign(b.profitLoss) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: '#999', textTransform: 'uppercase', marginBottom: 12, fontWeight: '600' }}>Bankroll Trend</div>
              <Sparkline points={bankrollPoints} width={220} height={80} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, letterSpacing: 1 }}>
                <span style={{ color: '#ccc' }}>${INIT_BANKROLL}</span>
                <span style={{ color: bankrollPoints[bankrollPoints.length - 1] >= INIT_BANKROLL ? '#007a4d' : '#cc2222', fontWeight: '700' }}>${bankrollPoints[bankrollPoints.length - 1].toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={s.section}>
        <SectionHeader>Quick Stats</SectionHeader>
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label="Win Rate"     value={quickStats.winRate != null ? `${quickStats.winRate.toFixed(1)}%` : '—'} color={quickStats.winRate == null ? '#1a1a1a' : quickStats.winRate > 52 ? '#007a4d' : quickStats.winRate < 48 ? '#cc2222' : '#1a1a1a'} />
          <StatCard label="Avg EV %"     value={quickStats.avgEV != null ? fmtSign(quickStats.avgEV) + '%' : '—'} color={quickStats.avgEV > 0 ? '#007a4d' : quickStats.avgEV < 0 ? '#cc2222' : '#1a1a1a'} />
          <StatCard label="Avg CLV"      value={quickStats.avgCLV != null ? fmtSign(quickStats.avgCLV, 1) : '—'} color={quickStats.avgCLV > 0 ? '#007a4d' : quickStats.avgCLV < 0 ? '#cc2222' : '#1a1a1a'} />
          <StatCard label="Biggest Win"  value={quickStats.biggestWin != null ? `+$${quickStats.biggestWin.toFixed(2)}` : '—'} color={quickStats.biggestWin > 0 ? '#007a4d' : '#1a1a1a'} />
          <StatCard label="Biggest Loss" value={quickStats.biggestLoss != null ? fmtSign(quickStats.biggestLoss) : '—'} color={quickStats.biggestLoss != null && quickStats.biggestLoss < 0 ? '#cc2222' : '#1a1a1a'} />
        </div>
      </div>
    </div>
  );
}
