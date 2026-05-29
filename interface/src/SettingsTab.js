import { useState } from 'react';
import { getApiKey, saveApiKey, fetchOdds } from './api';

function Label({ children }) {
  return (
    <div style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 6, fontWeight: '600' }}>
      {children}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 13, letterSpacing: 2, color: '#1a1a1a', textTransform: 'uppercase', fontWeight: '700', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #1a1a1a' }}>
      {children}
    </div>
  );
}

const STATUS = {
  none:    { color: '#999',    text: 'No key saved' },
  saved:   { color: '#c87800', text: 'Saved' },
  testing: { color: '#c87800', text: 'Testing...' },
  ok:      { color: '#007a4d', text: 'Connected' },
  error:   { color: '#cc2222', text: 'Connection failed' },
};

export default function SettingsTab() {
  const [key,    setKey]    = useState(getApiKey);
  const [status, setStatus] = useState(getApiKey() ? 'saved' : 'none');
  const [errMsg, setErrMsg] = useState('');

  const handleSave = () => {
    saveApiKey(key);
    setStatus('saved');
    setErrMsg('');
  };

  const handleTest = async () => {
    saveApiKey(key);
    setStatus('testing');
    setErrMsg('');
    try {
      await fetchOdds('basketball_nba', ['h2h']);
      setStatus('ok');
    } catch (e) {
      setStatus('error');
      setErrMsg(e.message);
    }
  };

  const st = STATUS[status];

  const s = {
    root:    { fontFamily: "'Courier New', monospace", color: '#1a1a1a', maxWidth: 520 },
    section: { marginBottom: 36 },
    input: {
      background: '#fff', border: '1px solid #d0d0d0', color: '#1a1a1a',
      fontFamily: "'Courier New', monospace", fontSize: 14, padding: '10px 12px',
      outline: 'none', width: '100%', boxSizing: 'border-box',
    },
    btn: active => ({
      background: active ? '#1a1a1a' : '#f0f0f0',
      border: '1px solid #d0d0d0',
      color: active ? '#fff' : '#aaa',
      fontFamily: "'Courier New', monospace", fontSize: 12,
      letterSpacing: 1, textTransform: 'uppercase',
      padding: '9px 18px', cursor: active ? 'pointer' : 'default',
    }),
  };

  return (
    <div style={s.root}>
      <div style={s.section}>
        <SectionHeader>API Key</SectionHeader>
        <div style={{ marginBottom: 14 }}>
          <Label>The Odds API Key</Label>
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setStatus('none'); }}
            placeholder="paste your key here"
            style={s.input}
            autoComplete="off"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <button style={s.btn(!!key.trim())} onClick={handleSave} disabled={!key.trim()}>Save</button>
          <button style={s.btn(!!key.trim() && status !== 'testing')} onClick={handleTest} disabled={!key.trim() || status === 'testing'}>
            Test Connection
          </button>
          <span style={{ fontSize: 13, color: st.color, fontWeight: '600' }}>{st.text}</span>
        </div>
        {errMsg && <div style={{ fontSize: 12, color: '#cc2222', marginBottom: 6 }}>{errMsg}</div>}
        <div style={{ fontSize: 13, color: '#888' }}>
          Get a key at the-odds-api.com.
        </div>
      </div>
    </div>
  );
}
