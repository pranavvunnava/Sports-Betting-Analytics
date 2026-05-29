import { useState, useEffect } from 'react';
import ModelTab      from './ModelTab';
import ArbTab        from './ArbTab';
import PromotionsTab from './PromotionsTab';
import TrackerTab    from './TrackerTab';
import DashboardTab  from './DashboardTab';
import SettingsTab   from './SettingsTab';
import { getApiKey } from './api';

const TABS = ['Model', 'Arbitrage', 'Promotions', 'Tracker', 'Dashboard', 'Settings'];

const styles = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#f8f8f8',
    color: '#1a1a1a',
    fontFamily: "'Courier New', Courier, monospace",
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: '1px solid #e0e0e0',
    padding: '0 32px',
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
    backgroundColor: '#ffffff',
  },
  logo: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1a1a1a',
    fontSize: '18px',
    fontWeight: '700',
    padding: '18px 0',
    whiteSpace: 'nowrap',
    letterSpacing: '0',
  },
  nav: { display: 'flex', gap: 0 },
  tab: {
    padding: '18px 20px',
    cursor: 'pointer',
    fontSize: '12px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: '#999',
    borderBottom: '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    color: '#1a1a1a',
    borderBottom: '2px solid #1a1a1a',
  },
  tabHover: { color: '#555' },
  statusBar: {
    display: 'flex', alignItems: 'center', gap: '8px',
    marginLeft: 'auto', fontSize: '11px',
  },
  content: { flex: 1, padding: '48px' },
};

export default function App() {
  const [activeTab,  setActiveTab]  = useState('Model');
  const [hoveredTab, setHoveredTab] = useState(null);
  const [hasApiKey,  setHasApiKey]  = useState(() => !!getApiKey());

  useEffect(() => {
    setHasApiKey(!!getApiKey());
  }, [activeTab]);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.logo}>Sports Betting Analytics</span>
        <nav style={styles.nav}>
          {TABS.map(tab => (
            <div
              key={tab}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {}),
                ...(hoveredTab === tab && activeTab !== tab ? styles.tabHover : {}),
              }}
              onClick={() => setActiveTab(tab)}
              onMouseEnter={() => setHoveredTab(tab)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              {tab}
            </div>
          ))}
        </nav>
        <div style={styles.statusBar}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            backgroundColor: hasApiKey ? '#007a4d' : '#d0d0d0',
          }} />
          <span style={{ color: hasApiKey ? '#007a4d' : '#bbb', letterSpacing: '1px', fontSize: 11 }}>
            {hasApiKey ? 'API CONNECTED' : 'NO API KEY'}
          </span>
        </div>
      </header>

      <main style={styles.content}>
        {activeTab === 'Model'      && <ModelTab />}
        {activeTab === 'Arbitrage'  && <ArbTab />}
        {activeTab === 'Promotions' && <PromotionsTab />}
        {activeTab === 'Tracker'    && <TrackerTab />}
        {activeTab === 'Dashboard'  && <DashboardTab />}
        {activeTab === 'Settings'   && <SettingsTab />}
      </main>
    </div>
  );
}
