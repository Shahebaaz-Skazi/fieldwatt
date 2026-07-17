import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { Users, UserCheck, CalendarDays, CheckCircle2, Clock, AlertTriangle, Eye, ShieldAlert, X, RefreshCw, ZoomIn, Search } from 'lucide-react';

const Dashboard = () => {
  const [data, setData] = useState({
    active_cycle_id: null,
    agents: [],
    summary: { total_agents: 0, present_agents: 0, leave_agents: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Global search states
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [searchActive, setSearchActive] = useState(false);
  const [searching, setSearching] = useState(false);
  const [viewingReading, setViewingReading] = useState(null);

  // Agent detail view modals
  const [viewingAgent, setViewingAgent] = useState(null);
  const [agentReadings, setAgentReadings] = useState([]);
  const [loadingReadings, setLoadingReadings] = useState(false);

  // Leave reassignment state
  const [reassignAgent, setReassignAgent] = useState(null);
  const [pendingProps, setPendingProps] = useState([]);
  const [targetAgentId, setTargetAgentId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  // Photo viewer zoom
  const [zoomPhoto, setZoomPhoto] = useState(null);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/admin/dashboard');
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000); // refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setViewingAgent(null);
        setReassignAgent(null);
        setZoomPhoto(null);
        setViewingReading(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAgentClick = async (agent) => {
    setViewingAgent(agent);
    setLoadingReadings(true);
    try {
      const readings = await api.get(`/admin/dashboard/agents/${agent.id}/readings`);
      setAgentReadings(readings);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReadings(false);
    }
  };

  const handleLeaveToggle = async (agent, currentLeaveStatus) => {
    const nextStatus = !currentLeaveStatus;
    setError('');
    setSuccess('');

    try {
      // Toggle leave status
      await api.patch(`/admin/dashboard/agents/${agent.id}/leave`, { is_on_leave: nextStatus });
      
      // If marking on leave and agent has pending properties, open reassignment wizard
      if (nextStatus && agent.pending_count > 0) {
        setReassignAgent(agent);
        // Fetch unread assignments for reassignment
        const pending = await api.get(`/admin/dashboard/agents/${agent.id}/pending-properties`);
        setPendingProps(pending);
        setTargetAgentId('');
      } else {
        setSuccess(`Agent ${agent.name} status updated.`);
      }
      
      fetchDashboardData();
    } catch (err) {
      setError(err.message || 'Failed to toggle leave status.');
    }
  };

  const handleReassignmentSubmit = async (e) => {
    e.preventDefault();
    if (!targetAgentId) return;

    setReassigning(true);
    setError('');
    setSuccess('');

    try {
      const propIds = pendingProps.map(p => p.id);
      await api.post('/admin/assignments/bulk', {
        agent_id: targetAgentId,
        property_ids: propIds
      });

      setSuccess(`Reassigned ${propIds.length} properties from ${reassignAgent.name} successfully.`);
      setReassignAgent(null);
      setPendingProps([]);
      fetchDashboardData();
    } catch (err) {
      setError(err.message || 'Failed to reassign properties.');
    } finally {
      setReassigning(false);
    }
  };

  const handleGlobalSearch = async (e) => {
    if (e) e.preventDefault();
    if (!globalQuery || !globalQuery.trim()) return;

    setSearching(true);
    setError('');
    setSuccess('');
    try {
      const results = await api.get('/admin/dashboard/global-search', {
        params: { q: globalQuery.trim() }
      });
      setGlobalResults(results);
      setSearchActive(true);
    } catch (err) {
      setError(err.message || 'Failed to execute global database search.');
    } finally {
      setSearching(false);
    }
  };

  const clearGlobalSearch = () => {
    setGlobalQuery('');
    setGlobalResults([]);
    setSearchActive(false);
  };

  if (loading) {
    return <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>Loading dashboard metrics...</div>;
  }

  // Calculate global totals
  let totalAssigned = 0;
  let totalDone = 0;
  let totalProblem = 0;
  let totalPending = 0;

  data.agents.forEach(agent => {
    totalAssigned += agent.assigned_count || 0;
    totalDone += agent.done_count || 0;
    totalProblem += agent.problem_count || 0;
    totalPending += agent.pending_count || 0;
  });

  const completionRate = totalAssigned > 0 ? Math.round((totalDone / totalAssigned) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Field Operations</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Real-time overview of current cycle activities and agent status</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent4)', borderRadius: '8px', border: '1px solid var(--accent4)' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent3)', borderRadius: '8px', border: '1px solid var(--accent3)' }}>
          {success}
        </div>
      )}

      {/* Global Property Search Bar */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>Global Database Search</h3>
          <p style={{ color: 'var(--muted)', fontSize: '12px' }}>Search properties across all zones and history by BP No, Name, Meter, Mobile, Address, Area or Agent name</p>
        </div>

        <form onSubmit={handleGlobalSearch} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Enter name, BP no, meter no, mobile..."
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '48px', paddingRight: '16px', height: '48px', fontSize: '14px', borderRadius: '10px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ height: '48px', padding: '0 24px' }} disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
          {searchActive && (
            <button type="button" onClick={clearGlobalSearch} className="btn btn-secondary" style={{ height: '48px', padding: '0 24px' }}>
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Global Property Search Results */}
      {searchActive && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>
                Search Results ({globalResults.length})
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>Showing matching records found in the system</p>
            </div>
            <button onClick={clearGlobalSearch} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              Close Results
            </button>
          </div>

          <div className="table-container" style={{ maxHeight: '450px', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>BP Order No.</th>
                  <th>Consumer Details</th>
                  <th>Meter Number</th>
                  <th>Area / MRU</th>
                  <th>Society & Address</th>
                  <th>Status</th>
                  <th>Assigned Agent</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {globalResults.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px' }}>
                      No properties found matching your query.
                    </td>
                  </tr>
                ) : (
                  globalResults.map((prop) => {
                    const mobile = prop.raw_sap_data?.['Mobile No.'] || prop.raw_sap_data?.['Telephone No.'] || 'N/A';
                    const bpNo = prop.raw_sap_data?.['BP No.'] || '-';
                    return (
                      <tr key={prop.id}>
                        <td>
                          <div style={{ fontWeight: '700', color: 'var(--text)' }}>{prop.serial_no}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>BP: {bpNo}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', color: 'var(--text)' }}>{prop.consumer_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Mob: {mobile}</div>
                        </td>
                        <td style={{ fontWeight: '600' }}>{prop.meter_no || '-'}</td>
                        <td>
                          <span className="badge badge-pending" style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>
                            {prop.area_name}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: '500', color: 'var(--text)', fontSize: '12px' }}>{prop.society || 'No Society'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={prop.address}>
                            {prop.address}
                          </div>
                        </td>
                        <td>
                          {prop.assignment_id ? (
                            prop.status_code ? (
                              <span className={`badge ${prop.status_code === 'reading_taken' ? 'badge-success' : 'badge-danger'}`}>
                                {prop.status_code.replace('_', ' ')}
                              </span>
                            ) : (
                              <span className="badge badge-pending">Assigned</span>
                            )
                          ) : (
                            <span className="badge badge-pending" style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td>
                          {prop.agent_name ? (
                            <div style={{ fontWeight: '500' }}>{prop.agent_name}</div>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {prop.agent_name && prop.status_code ? (
                            <button
                              onClick={() => setViewingReading(prop)}
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                            >
                              View Reading
                            </button>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>No Reading</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aggregate Stats Cards */}
      <div className="dashboard-grid">
        <div className="widget-card">
          <div className="widget-icon" style={{ background: 'rgba(79, 156, 249, 0.1)', color: 'var(--accent2)' }}>
            <Users size={20} />
          </div>
          <span className="widget-title">Total Agents</span>
          <span className="widget-value">{data.summary.total_agents}</span>
        </div>

        <div className="widget-card">
          <div className="widget-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent3)' }}>
            <UserCheck size={20} />
          </div>
          <span className="widget-title">Present Today</span>
          <span className="widget-value">{data.summary.present_agents}</span>
        </div>

        <div className="widget-card">
          <div className="widget-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent4)' }}>
            <CalendarDays size={20} />
          </div>
          <span className="widget-title">On Leave</span>
          <span className="widget-value">{data.summary.leave_agents}</span>
        </div>

        <div className="widget-card">
          <div className="widget-icon">
            <CheckCircle2 size={20} />
          </div>
          <span className="widget-title">Completion Rate</span>
          <span className="widget-value">{completionRate}%</span>
        </div>
      </div>

      {/* Live Agent Attendance & Progress Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text)' }}>Agent Tracking Board</h3>
          
          {/* Search Input widget */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search agent name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '38px', paddingVertical: '8px', fontSize: '13px' }}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Phone Number</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Last Active</th>
                <th>Assigned</th>
                <th>Done</th>
                <th>Pending</th>
                <th>Problem</th>
                <th>Leave Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No agents registered or active in this workspace.</td>
                </tr>
              ) : data.agents.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.phone.includes(searchTerm)).length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No agents match your active search filter.</td>
                </tr>
              ) : (
                data.agents
                  .filter(agent => agent.name.toLowerCase().includes(searchTerm.toLowerCase()) || agent.phone.includes(searchTerm))
                  .map((agent) => (
                    <tr key={agent.id} style={{ opacity: agent.is_on_leave ? 0.6 : 1 }}>
                      <td style={{ fontWeight: '600', color: 'var(--text)' }}>{agent.name}</td>
                      <td>{agent.phone}</td>
                    <td>
                      {agent.is_on_leave ? (
                        <span className="badge badge-danger">On Leave</span>
                      ) : agent.login_time ? (
                        <span className="badge badge-success">Online</span>
                      ) : (
                        <span className="badge badge-pending">Offline</span>
                      )}
                    </td>
                    <td>
                      {agent.login_time ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={14} style={{ color: 'var(--muted)' }} />
                          {new Date(agent.login_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ) : '-'}
                    </td>
                    <td>
                      {agent.last_active ? (
                        new Date(agent.last_active).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      ) : '-'}
                    </td>
                    <td style={{ fontWeight: '500' }}>{agent.assigned_count}</td>
                    <td style={{ color: 'var(--accent3)', fontWeight: '600' }}>{agent.done_count}</td>
                    <td style={{ color: 'var(--accent)', fontWeight: '500' }}>{agent.pending_count}</td>
                    <td style={{ color: 'var(--accent4)', fontWeight: '600' }}>{agent.problem_count}</td>
                    <td>
                      <button
                        onClick={() => handleLeaveToggle(agent, agent.is_on_leave)}
                        className={`btn ${agent.is_on_leave ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        {agent.is_on_leave ? 'On Leave' : 'Mark Leave'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleAgentClick(agent)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', cursor: 'pointer' }}
                        title="View activity detail log"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Detail Modal (Drawer) */}
      {viewingAgent && (
        <div className="modal-overlay" onClick={() => setViewingAgent(null)}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>{viewingAgent.name} - Cycle Submissions</h2>
                <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>{viewingAgent.phone} · Activity log & uploads</p>
              </div>
              <button onClick={() => setViewingAgent(null)} className="btn btn-secondary" style={{ padding: '4px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            {loadingReadings ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Fetching agent records...</div>
            ) : (
              <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Serial No</th>
                      <th>Consumer Name</th>
                      <th>Status</th>
                      <th>Reading Value</th>
                      <th>Photo Check</th>
                      <th>Anomalies</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentReadings.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No readings submitted by this agent yet.</td>
                      </tr>
                    ) : (
                      agentReadings.map((reading) => (
                        <tr key={reading.reading_id}>
                          <td style={{ fontWeight: '600', color: 'var(--text)' }}>{reading.serial_no}</td>
                          <td>{reading.consumer_name}</td>
                          <td>
                            <span className={`badge ${reading.status_code === 'reading_taken' ? 'badge-success' : 'badge-danger'}`}>
                              {reading.status_code.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ fontWeight: '600' }}>
                            {reading.reading_value !== null ? `${reading.reading_value} kWh` : '-'}
                          </td>
                          <td>
                            {reading.photo_url ? (
                              <button 
                                onClick={() => setZoomPhoto(reading.photo_url)} 
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none' }}
                              >
                                <ZoomIn size={14} />
                                <span style={{ fontSize: '12px', textDecoration: 'underline' }}>View Photo</span>
                              </button>
                            ) : '-'}
                          </td>
                          <td>
                            {reading.is_anomalous ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent4)' }} title={reading.anomaly_reason}>
                                <AlertTriangle size={14} />
                                <span style={{ fontSize: '11px', fontWeight: '600' }}>Flagged</span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--accent3)', fontSize: '11px' }}>Clear</span>
                            )}
                          </td>
                          <td style={{ fontSize: '12px' }}>
                            {new Date(reading.submitted_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leave Reassignment Modal */}
      {reassignAgent && (
        <div className="modal-overlay" onClick={() => { setReassignAgent(null); setPendingProps([]); }}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text)' }}>Reassign Pending Work</h2>
              <button onClick={() => { setReassignAgent(null); setPendingProps([]); }} className="btn btn-secondary" style={{ padding: '4px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '8px 0' }}>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '12px', borderRadius: '8px', display: 'flex', gap: '10px' }}>
                <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: '#92400e' }}>
                  Agent <b>{reassignAgent.name}</b> has been marked on leave. There are <b>{pendingProps.length} unread properties</b> assigned to them that need to be reallocated.
                </div>
              </div>
            </div>

            <form onSubmit={handleReassignmentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Choose Target Agent</label>
                <select
                  required
                  className="form-input"
                  value={targetAgentId}
                  onChange={(e) => setTargetAgentId(e.target.value)}
                >
                  <option value="">Select active agent...</option>
                  {data.agents
                    .filter(a => a.id !== reassignAgent.id && !a.is_on_leave && a.is_active)
                    .map(a => <option key={a.id} value={a.id}>{a.name} ({a.phone})</option>)}
                </select>
              </div>

              <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', background: '#f9fafb' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>Properties to Reassign:</span>
                {pendingProps.map(p => (
                  <div key={p.id} style={{ fontSize: '12px', color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    Sr. {p.serial_no} · {p.consumer_name}
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={reassigning || !targetAgentId}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}
              >
                {reassigning ? 'Reassigning...' : `Transfer ${pendingProps.length} Assignments`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Zoom Photo Modal */}
      {zoomPhoto && (
        <div className="modal-overlay" onClick={() => setZoomPhoto(null)} style={{ cursor: 'zoom-out' }}>
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setZoomPhoto(null)} 
              className="btn btn-secondary" 
              style={{ position: 'absolute', top: '-40px', right: 0, padding: '6px 12px', color: 'var(--text)', background: 'var(--border-light)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '4px' }}
            >
              Close [X]
            </button>
            <img 
              src={zoomPhoto} 
              alt="Meter register zoom verification" 
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px', border: '2px solid var(--border)', boxShadow: 'var(--shadow)' }} 
            />
          </div>
        </div>
      )}

      {/* Property Reading Details Modal */}
      {viewingReading && (
        <div className="modal-overlay" onClick={() => setViewingReading(null)}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>Reading Details</h2>
                <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>Consumer Order Sr. {viewingReading.serial_no}</p>
              </div>
              <button onClick={() => setViewingReading(null)} className="btn btn-secondary" style={{ padding: '4px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', margin: '8px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Consumer Name</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{viewingReading.consumer_name}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Mobile / Contact</span>
                  <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                    {viewingReading.raw_sap_data?.['Mobile No.'] || viewingReading.raw_sap_data?.['Telephone No.'] || 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Meter Number</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{viewingReading.meter_no || 'N/A'}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Area / Zone</span>
                  <span style={{ fontSize: '14px', color: 'var(--text)' }}>{viewingReading.area_name}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Reading Status</span>
                  <span className={`badge ${viewingReading.status_code === 'reading_taken' ? 'badge-success' : 'badge-danger'}`} style={{ marginTop: '4px' }}>
                    {viewingReading.status_code.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Reading Value</span>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text)' }}>
                    {viewingReading.reading_value !== null ? `${viewingReading.reading_value} kWh` : 'No Reading'}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Society & Address</span>
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                  <b>{viewingReading.society}</b> {viewingReading.address}
                </span>
              </div>

              {viewingReading.note && (
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Agent Note</span>
                  <span style={{ fontSize: '13px', color: 'var(--text)', fontStyle: 'italic' }}>"{viewingReading.note}"</span>
                </div>
              )}

              {viewingReading.is_anomalous && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent4)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '10px' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--accent4)', flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent4)', display: 'block' }}>Anomaly Detected</span>
                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>{viewingReading.anomaly_reason}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Assigned Field Agent</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{viewingReading.agent_name}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Submission Date</span>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>{new Date(viewingReading.submitted_at).toLocaleString()}</span>
                </div>
              </div>

              {viewingReading.photo_url && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Reading Verification Photo</span>
                  <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setZoomPhoto(viewingReading.photo_url)}>
                    <img 
                      src={viewingReading.photo_url} 
                      alt="Verification meter upload" 
                      style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} 
                    />
                    <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ZoomIn size={12} /> Click to zoom
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
