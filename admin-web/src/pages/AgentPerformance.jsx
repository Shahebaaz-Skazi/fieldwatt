import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { TrendingUp, Users, CheckCircle, Clock, AlertTriangle, RefreshCw, Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

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

const AgentPerformance = ({ performanceViewerMode = false }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('monthly');
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [expandedTab, setExpandedTab] = useState('metrics');

  // Calendar States
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
  const [calendarStats, setCalendarStats] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(false);

  const fetchCalendarData = useCallback(async (agentId, year, month) => {
    setCalendarLoading(true);
    try {
      const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
      const res = await api.get(`/admin/agent-performance/${agentId}/calendar?month=${monthStr}`);
      setCalendarStats(res.stats || {});
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expandedAgent && expandedTab === 'calendar') {
      fetchCalendarData(expandedAgent, calendarYear, calendarMonth);
    }
  }, [expandedAgent, expandedTab, calendarYear, calendarMonth, fetchCalendarData]);

  const handlePrevMonth = () => {
    if (calendarMonth === 1) {
      setCalendarMonth(12);
      setCalendarYear(y => y - 1);
    } else {
      setCalendarMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 12) {
      setCalendarMonth(1);
      setCalendarYear(y => y + 1);
    } else {
      setCalendarMonth(m => m + 1);
    }
  };

  const getDaysInMonth = (year, month) => {
    const date = new Date(year, month - 1, 1);
    const days = [];
    const firstDayIndex = date.getDay();
    const totalDays = new Date(year, month, 0).getDate();
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === 'cycle' && selectedCycleId) {
        params.append('cycle_id', selectedCycleId);
      }
      const result = await api.get(`/admin/agent-performance?${params}`);
      setData(result);
      setError(null);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch agent performance:', err);
      setError('Failed to load agent data. Click Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, [period, selectedCycleId]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10 minutes
    const interval = setInterval(fetchData, 600000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const displayedAgents = (data?.agents || []).filter(a => selectedAgentFilter === 'all' || a.agent_id === selectedAgentFilter);

  const totalStats = displayedAgents.reduce((acc, a) => ({
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
            {performanceViewerMode
              ? `Showing performance for ${data?.agents?.length || 0} assigned agents`
              : "Real-time breakdown of every agent's field activity"}
            {lastRefreshed && ` · Refreshed ${lastRefreshed.toLocaleTimeString()}`}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Period & Agent Filters */}
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

        {/* Agent Selector Dropdown */}
        {data?.agents && data.agents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>Agent:</span>
            <select
              value={selectedAgentFilter}
              onChange={e => setSelectedAgentFilter(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px', fontWeight: '600' }}
            >
              <option value="all">{performanceViewerMode ? '[ All Assigned Agents ]' : '[ All Agents ]'}</option>
              {data.agents.map(a => (
                <option key={a.agent_id} value={a.agent_id}>
                  {a.agent_name}
                </option>
              ))}
            </select>
          </div>
        )}

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

      {/* Error Alert */}
      {error && !loading && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '10px', padding: '16px', color: '#ef4444', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Agent Cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--muted)' }}>Loading agent data...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayedAgents.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              No assigned agents or performance metrics found.
            </div>
          ) : (
            displayedAgents.map(agent => {
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
                  onClick={() => {
                    if (isExpanded && expandedTab === 'metrics') {
                      setExpandedAgent(null);
                    } else {
                      setExpandedAgent(agent.agent_id);
                      setExpandedTab('metrics');
                    }
                  }}
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isExpanded && expandedTab === 'calendar') {
                          setExpandedAgent(null);
                        } else {
                          setExpandedAgent(agent.agent_id);
                          setExpandedTab('calendar');
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: expandedTab === 'calendar' && isExpanded ? 'var(--accent2, #f5a623)' : 'var(--muted)',
                        cursor: 'pointer',
                        padding: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        marginLeft: '8px',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      title="View daily activity calendar"
                    >
                      <Calendar size={16} />
                    </button>
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isExpanded && expandedTab === 'metrics') {
                          setExpandedAgent(null);
                        } else {
                          setExpandedAgent(agent.agent_id);
                          setExpandedTab('metrics');
                        }
                      }}
                      style={{ fontSize: '16px', color: 'var(--muted)', marginLeft: '8px', cursor: 'pointer', padding: '4px' }}
                    >
                      {isExpanded && expandedTab === 'metrics' ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--card, var(--surface))' }}>
                    {expandedTab === 'metrics' ? (
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
                    ) : (
                      /* Calendar View Dropdown */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Calendar Month Control */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--border-light, #f3f4f6)', borderRadius: '10px', padding: '10px 14px' }}>
                          <button className="btn btn-secondary" onClick={handlePrevMonth} style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <ChevronLeft size={16} /> Prev
                          </button>
                          <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text)' }}>
                            {new Date(calendarYear, calendarMonth - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                          </span>
                          <button className="btn btn-secondary" onClick={handleNextMonth} style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            Next <ChevronRight size={16} />
                          </button>
                        </div>

                        {/* Calendar Grid */}
                        {calendarLoading ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--muted)', fontSize: '13px' }}>Loading calendar data...</div>
                        ) : (
                          <div>
                            {/* Day Names Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontWeight: '600', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
                            </div>

                            {/* Day Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                              {getDaysInMonth(calendarYear, calendarMonth).map((day, idx) => {
                                if (day === null) {
                                  return <div key={`empty-${idx}`} style={{ minHeight: '65px', background: 'transparent' }} />;
                                }

                                const dateStr = `${calendarYear}-${calendarMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                                const stats = calendarStats[dateStr];

                                return (
                                  <div 
                                    key={dateStr} 
                                    style={{ 
                                      minHeight: '65px', 
                                      border: '1px solid var(--border)', 
                                      borderRadius: '8px', 
                                      padding: '6px', 
                                      background: 'var(--surface)', 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      justifyContent: 'space-between',
                                      boxSizing: 'border-box'
                                    }}
                                  >
                                    <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--muted)' }}>{day}</span>
                                    {stats && stats.total > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {stats.done > 0 && (
                                          <span style={{ fontSize: '9px', fontWeight: '700', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '1px 3px', borderRadius: '4px', textAlign: 'center', display: 'block', whiteSpace: 'nowrap' }} title="Readings Taken">
                                            ✓ {stats.done}
                                          </span>
                                        )}
                                        {stats.other > 0 && (
                                          <span style={{ fontSize: '9px', fontWeight: '700', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 3px', borderRadius: '4px', textAlign: 'center', display: 'block', whiteSpace: 'nowrap' }} title="Locks / Other Status">
                                            ⚠ {stats.other}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: '12px', justifyContent: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} /> Reading Done
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} /> Door Locked / Other
                          </span>
                        </div>
                      </div>
                    )}
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
