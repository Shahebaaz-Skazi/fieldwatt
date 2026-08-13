import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { TrendingUp, Users, CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

const STATUS_CONFIG = {
  reading_taken:  { label: 'Reading Done',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  door_locked:    { label: 'Door Locked',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  not_reachable:  { label: 'Not Reachable',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  access_denied:  { label: 'Access Denied',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  meter_not_found:{ label: 'Meter Not Found',color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  meter_damaged:  { label: 'Meter Damaged',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  vacant_property:{ label: 'Vacant',         color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  revisit_needed: { label: 'Needs Revisit',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  not_visited:    { label: 'Not Visited Yet', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
};

const AgentPerformance = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('monthly');
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [expandedAgent, setExpandedAgent] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === 'cycle' && selectedCycleId) {
        params.append('cycle_id', selectedCycleId);
      }
      const result = await api.get(`/admin/agent-performance?${params}`);
      setData(result);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch agent performance:', err);
    } finally {
      setLoading(false);
    }
  }, [period, selectedCycleId]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalStats = data?.agents?.reduce((acc, a) => ({
    total_assigned: acc.total_assigned + parseInt(a.total_assigned || 0),
    reading_taken:  acc.reading_taken  + parseInt(a.reading_taken  || 0),
    not_visited:    acc.not_visited    + parseInt(a.not_visited     || 0),
    door_locked:    acc.door_locked    + parseInt(a.door_locked     || 0),
  }), { total_assigned: 0, reading_taken: 0, not_visited: 0, door_locked: 0 });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Agent Performance</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
            Real-time breakdown of every agent's field activity
            {lastRefreshed && ` · Refreshed ${lastRefreshed.toLocaleTimeString()}`}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Period Filter */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '3px', gap: '2px' }}>
          {[
            { value: 'daily',   label: 'Today' },
            { value: 'weekly',  label: 'This Week' },
            { value: 'monthly', label: 'This Month' },
            { value: 'cycle',   label: 'By Cycle' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              style={{
                padding: '7px 20px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: period === opt.value ? '600' : '400',
                background: period === opt.value ? '#f5a623' : 'transparent',
                color: period === opt.value ? '#000' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === 'cycle' && data?.cycles && (
          <select
            value={selectedCycleId}
            onChange={e => setSelectedCycleId(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
          >
            <option value="">Select a cycle...</option>
            {data.cycles.map(c => (
              <option key={c.id} value={c.id}>
                {c.label} {c.is_active ? '(Active)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary Cards */}
      {totalStats && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total Assigned', value: totalStats.total_assigned, color: '#4f9cf9', icon: <Users size={18}/> },
            { label: 'Readings Done', value: totalStats.reading_taken,  color: '#22c55e', icon: <CheckCircle size={18}/> },
            { label: 'Not Visited Yet', value: totalStats.not_visited,  color: '#94a3b8', icon: <Clock size={18}/> },
            { label: 'Door Locked', value: totalStats.door_locked,      color: '#f59e0b', icon: <AlertTriangle size={18}/> },
          ].map(card => (
            <div key={card.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', borderTop: `3px solid ${card.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', textTransform: 'uppercase' }}>{card.label}</span>
                <span style={{ color: card.color }}>{card.icon}</span>
              </div>
              <span style={{ fontSize: '28px', fontWeight: '700', color: card.color }}>{card.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Agent Cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--muted)' }}>Loading agent data...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data?.agents?.map(agent => {
            const totalAssigned = parseInt(agent.total_assigned || 0);
            const readingTaken = parseInt(agent.reading_taken || 0);
            const notVisited = parseInt(agent.not_visited || 0);
            const completionPct = parseFloat(agent.completion_percentage || 0);
            const isExpanded = expandedAgent === agent.agent_id;
            const lastLogin = agent.last_login ? new Date(agent.last_login) : null;
            const minutesSinceLogin = lastLogin ? Math.floor((Date.now() - lastLogin) / 60000) : null;
            const isActiveToday = minutesSinceLogin !== null && minutesSinceLogin < 1440;

            return (
              <div key={agent.agent_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', borderLeft: `4px solid ${completionPct >= 80 ? '#22c55e' : completionPct >= 50 ? '#f59e0b' : '#ef4444'}` }}>

                {/* Agent Header Row */}
                <div
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.agent_id)}
                  style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', alignItems: 'center', gap: '20px', padding: '16px 20px', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}
                >
                  {/* Left: Avatar + Name + Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: isActiveToday ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: isActiveToday ? '#22c55e' : '#94a3b8', flexShrink: 0 }}>
                      {agent.agent_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text)' }}>{agent.agent_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                        {isActiveToday
                          ? minutesSinceLogin < 60
                            ? `🟢 Active ${minutesSinceLogin}m ago`
                            : `🟡 Last seen ${Math.floor(minutesSinceLogin/60)}h ago`
                          : lastLogin
                            ? `⚫ Last login ${lastLogin.toLocaleDateString('en-IN')}`
                            : '⚫ Never logged in'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Middle: Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
                      <span>{readingTaken} of {totalAssigned} readings done</span>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: completionPct >= 80 ? '#22c55e' : completionPct >= 50 ? '#f59e0b' : '#ef4444' }}>{completionPct}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${completionPct}%`, background: completionPct >= 80 ? '#22c55e' : completionPct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>

                  {/* Right: Stats + expand arrow */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: '600', whiteSpace: 'nowrap' }}>✓ {readingTaken} Done</span>
                    <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>⏳ {notVisited} Pending</span>
                    <span style={{ fontSize: '16px', color: 'var(--muted)', marginLeft: '8px' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--card, var(--surface))' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                        const count = key === 'not_visited' ? notVisited : parseInt(agent[key] || 0);
                        return (
                          <div key={key} style={{ background: cfg.bg, border: `1px solid ${cfg.color}22`, borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: '12px', color: cfg.color, fontWeight: '600', marginBottom: '4px' }}>{cfg.label}</div>
                            <div style={{ fontSize: '28px', fontWeight: '700', color: cfg.color }}>{count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgentPerformance;
