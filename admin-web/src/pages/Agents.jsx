import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { Plus, Edit2, ShieldAlert, Check, X, Search, Phone, Mail, UserPlus } from 'lucide-react';

const Agents = () => {
  const user = useAuthStore((state) => state.user);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', username: '', password: '' });
  const [editingAgent, setEditingAgent] = useState(null);

  // Viewer states
  const [viewers, setViewers] = useState([]);
  const [viewerFormData, setViewerFormData] = useState({ name: '', email: '', password: '' });
  const [creatingViewer, setCreatingViewer] = useState(false);
  const [viewerError, setViewerError] = useState('');
  const [viewerSuccess, setViewerSuccess] = useState('');

  // Contractor Account states
  const [contractors, setContractors] = useState([]);
  const [contractorFormData, setContractorFormData] = useState({ username: '', password: '', confirmPassword: '', selectedAgentIds: [] });
  const [contractorAgentSearch, setContractorAgentSearch] = useState('');
  const [creatingContractor, setCreatingContractor] = useState(false);
  const [contractorError, setContractorError] = useState('');
  const [contractorSuccess, setContractorSuccess] = useState('');
  
  // Contractor Edit & Reset Modals
  const [editingContractor, setEditingContractor] = useState(null);
  const [editAgentSearch, setEditAgentSearch] = useState('');
  const [editAgentIds, setEditAgentIds] = useState([]);
  const [resetPwContractor, setResetPwContractor] = useState(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  const isAdmin = !user?.role || user?.role === 'admin';

  const fetchAgents = async () => {
    try {
      const data = await api.get('/admin/agents');
      setAgents(data);
    } catch (err) {
      setError(err.message || 'Failed to retrieve agents list.');
    } finally {
      setLoading(false);
    }
  };

  const fetchViewers = async () => {
    if (!isAdmin) return;
    try {
      const data = await api.get('/auth/admin/viewers');
      setViewers(data);
    } catch (err) {
      console.error('Failed to fetch viewers:', err);
    }
  };

  const fetchContractors = async () => {
    if (!isAdmin) return;
    try {
      const data = await api.get('/auth/admin/contractors');
      setContractors(data);
    } catch (err) {
      console.error('Failed to fetch contractors:', err);
    }
  };

  const handleCreateViewer = async (e) => {
    e.preventDefault();
    setViewerError('');
    setViewerSuccess('');
    setCreatingViewer(true);
    try {
      await api.post('/auth/admin/create-viewer', viewerFormData);
      setViewerSuccess('Viewer account created successfully.');
      setViewerFormData({ name: '', email: '', password: '' });
      fetchViewers();
    } catch (err) {
      setViewerError(err.message || 'Failed to create viewer account.');
    } finally {
      setCreatingViewer(false);
    }
  };

  const handleCreateContractor = async (e) => {
    e.preventDefault();
    setContractorError('');
    setContractorSuccess('');

    if (contractorFormData.password !== contractorFormData.confirmPassword) {
      return setContractorError('Passwords do not match.');
    }
    if (contractorFormData.selectedAgentIds.length === 0) {
      return setContractorError('Please assign at least one agent to this account.');
    }

    setCreatingContractor(true);
    try {
      await api.post('/auth/admin/create-contractor', {
        username: contractorFormData.username,
        password: contractorFormData.password,
        agent_ids: contractorFormData.selectedAgentIds
      });
      setContractorSuccess('Agent Performance Contractor account created successfully.');
      setContractorFormData({ username: '', password: '', confirmPassword: '', selectedAgentIds: [] });
      fetchContractors();
    } catch (err) {
      setContractorError(err.message || 'Failed to create contractor account.');
    } finally {
      setCreatingContractor(false);
    }
  };

  const handleToggleStatus = async (contractor) => {
    const newStatus = contractor.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await api.patch(`/auth/admin/contractors/${contractor.id}/status`, { status: newStatus });
      fetchContractors();
    } catch (err) {
      alert(err.message || 'Failed to update account status.');
    }
  };

  const handleSaveEditAgents = async (e) => {
    e.preventDefault();
    if (editAgentIds.length === 0) {
      return alert('Please select at least one agent.');
    }
    try {
      await api.patch(`/auth/admin/contractors/${editingContractor.id}/agents`, { agent_ids: editAgentIds });
      setEditingContractor(null);
      fetchContractors();
    } catch (err) {
      alert(err.message || 'Failed to update assigned agents.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPasswordVal || resetPasswordVal.length < 6) {
      return alert('Password must be at least 6 characters.');
    }
    try {
      await api.patch(`/auth/admin/contractors/${resetPwContractor.id}/password`, { password: resetPasswordVal });
      setResetPwContractor(null);
      setResetPasswordVal('');
      alert('Password reset successfully.');
    } catch (err) {
      alert(err.message || 'Failed to reset password.');
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchViewers();
    fetchContractors();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setShowEditModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/agents', formData);
      setShowAddModal(false);
      setFormData({ name: '', phone: '', email: '', username: '', password: '' });
      fetchAgents();
    } catch (err) {
      setError(err.message || 'Failed to create agent.');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/admin/agents/${editingAgent.id}`, {
        name: editingAgent.name,
        phone: editingAgent.phone,
        email: editingAgent.email,
        username: editingAgent.username,
        is_active: editingAgent.is_active,
      });
      setShowEditModal(false);
      setEditingAgent(null);
      fetchAgents();
    } catch (err) {
      setError(err.message || 'Failed to update agent details.');
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this agent?')) return;
    try {
      await api.delete(`/admin/agents/${id}`);
      fetchAgents();
    } catch (err) {
      setError(err.message || 'Failed to deactivate agent.');
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>Loading agents records...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Directory</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Register, update, and manage agent status guards</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <Plus size={16} />
          Register Agent
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent4)', borderRadius: '8px', border: '1px solid var(--accent4)' }}>
          {error}
        </div>
      )}

      {/* Agents grid table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Agent Name</th>
              <th>Username</th>
              <th>Phone Connection</th>
              <th>Email address</th>
              <th>Active Status</th>
              <th>Created Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No agents registered yet.</td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr key={agent.id} style={{ opacity: agent.is_active ? 1 : 0.6 }}>
                  <td style={{ fontWeight: '600', color: 'var(--text)' }}>{agent.name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent2)' }}>{agent.username}</td>
                  <td>{agent.phone}</td>
                  <td>{agent.email || '-'}</td>
                  <td>
                    {agent.is_active ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge badge-danger">Deactivated</span>
                    )}
                  </td>
                  <td>{new Date(agent.created_at).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setEditingAgent(agent); setShowEditModal(true); }}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px' }}
                    >
                      <Edit2 size={14} />
                    </button>
                    {agent.is_active && (
                      <button
                        onClick={() => handleDeactivate(agent.id)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', color: 'var(--accent4)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                      >
                        <ShieldAlert size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Viewer Accounts Management Section */}
      {isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)', margin: 0 }}>MNGL Viewer Accounts</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Create and manage read-only access accounts for MNGL personnel</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px', alignItems: 'start' }}>
            {/* Create form */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={18} /> Create Viewer Account
              </h3>
              {viewerSuccess && (
                <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent3)', borderRadius: '8px', border: '1px solid var(--accent3)', fontSize: '13px', marginBottom: '16px' }}>
                  {viewerSuccess}
                </div>
              )}
              {viewerError && (
                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent4)', borderRadius: '8px', border: '1px solid var(--accent4)', fontSize: '13px', marginBottom: '16px' }}>
                  {viewerError}
                </div>
              )}
              <form onSubmit={handleCreateViewer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MNGL Officer"
                    className="form-input"
                    value={viewerFormData.name}
                    onChange={(e) => setViewerFormData({ ...viewerFormData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. officer@mngl.in"
                    className="form-input"
                    value={viewerFormData.email}
                    onChange={(e) => setViewerFormData({ ...viewerFormData, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 8 characters"
                    className="form-input"
                    value={viewerFormData.password}
                    onChange={(e) => setViewerFormData({ ...viewerFormData, password: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%', marginTop: '8px' }} disabled={creatingViewer}>
                  {creatingViewer ? 'Creating Account...' : 'Create MNGL Viewer Account'}
                </button>
              </form>
            </div>

            {/* List existing viewers */}
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email Address</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {viewers.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No viewer accounts created yet.</td>
                    </tr>
                  ) : (
                    viewers.map((v) => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: '600', color: 'var(--text)' }}>{v.name}</td>
                        <td>{v.email}</td>
                        <td>{new Date(v.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Agent Performance Accounts Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '32px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)', margin: 0 }}>Agent Performance Accounts</h2>
                <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Create limited-access accounts that can view performance data only for assigned agents.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px', alignItems: 'start' }}>
              {/* Create Contractor Form */}
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--text)', marginBottom: '16px' }}>
                  Create Performance Account
                </h3>

                {contractorError && (
                  <div style={{ padding: '10px', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--accent4)', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                    {contractorError}
                  </div>
                )}
                {contractorSuccess && (
                  <div style={{ padding: '10px', backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--accent3)', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                    {contractorSuccess}
                  </div>
                )}

                <form onSubmit={handleCreateContractor} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Username</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. contractor01"
                      className="form-input"
                      value={contractorFormData.username}
                      onChange={(e) => setContractorFormData({ ...contractorFormData, username: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      className="form-input"
                      value={contractorFormData.password}
                      onChange={(e) => setContractorFormData({ ...contractorFormData, password: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Confirm Password"
                      className="form-input"
                      value={contractorFormData.confirmPassword}
                      onChange={(e) => setContractorFormData({ ...contractorFormData, confirmPassword: e.target.value })}
                    />
                  </div>

                  {/* Assign Agents Multi-Select Searchable Dropdown */}
                  <div className="form-group" style={{ opacity: (contractorFormData.username && contractorFormData.password) ? 1 : 0.5 }}>
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Assign Agents ({contractorFormData.selectedAgentIds.length} selected)</span>
                    </label>
                    
                    {/* Selected Agent Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      {contractorFormData.selectedAgentIds.map(id => {
                        const ag = agents.find(a => a.id === id);
                        if (!ag) return null;
                        return (
                          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '12px', background: 'var(--accent3-light)', color: 'var(--accent3)', fontSize: '12px', fontWeight: '600' }}>
                            {ag.name}
                            <X size={12} style={{ cursor: 'pointer' }} onClick={() => setContractorFormData(prev => ({ ...prev, selectedAgentIds: prev.selectedAgentIds.filter(x => x !== id) }))} />
                          </span>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      placeholder="Search agents by name or username..."
                      className="form-input"
                      value={contractorAgentSearch}
                      onChange={(e) => setContractorAgentSearch(e.target.value)}
                      disabled={!contractorFormData.username || !contractorFormData.password}
                    />

                    {/* Agent selection dropdown list */}
                    {contractorFormData.username && contractorFormData.password && (
                      <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '6px', background: 'var(--surface)' }}>
                        {agents
                          .filter(a => !contractorFormData.selectedAgentIds.includes(a.id))
                          .filter(a => !contractorAgentSearch || a.name.toLowerCase().includes(contractorAgentSearch.toLowerCase()) || (a.username && a.username.toLowerCase().includes(contractorAgentSearch.toLowerCase())))
                          .map(a => (
                            <div
                              key={a.id}
                              onClick={() => {
                                setContractorFormData(prev => ({ ...prev, selectedAgentIds: [...prev.selectedAgentIds, a.id] }));
                              }}
                              style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              className="agent-select-row"
                            >
                              <span style={{ fontWeight: '600' }}>{a.name}</span>
                              <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{a.username || a.phone}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%', marginTop: '8px' }} disabled={creatingContractor}>
                    {creatingContractor ? 'Creating Account...' : 'Create Agent Performance Account'}
                  </button>
                </form>
              </div>

              {/* List existing contractors table */}
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Assigned Agents</th>
                      <th>Status</th>
                      <th>Created At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractors.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No performance contractor accounts created yet.</td>
                      </tr>
                    ) : (
                      contractors.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: '600', color: 'var(--text)' }}>{c.username}</td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '240px' }}>
                              {c.assigned_agents.map(ag => (
                                <span key={ag.id} style={{ fontSize: '11px', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text)' }}>
                                  {ag.name}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600',
                              background: c.status === 'ACTIVE' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                              color: c.status === 'ACTIVE' ? 'var(--accent3)' : 'var(--accent4)'
                            }}>
                              {c.status}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => {
                                  setEditingContractor(c);
                                  setEditAgentIds(c.assigned_agents.map(a => a.id));
                                }}
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                title="Edit Assigned Agents"
                              >
                                Edit Access
                              </button>
                              <button
                                onClick={() => handleToggleStatus(c)}
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '12px', color: c.status === 'ACTIVE' ? 'var(--accent4)' : 'var(--accent3)' }}
                              >
                                {c.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                onClick={() => setResetPwContractor(c)}
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                title="Reset Password"
                              >
                                Reset Password
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>Register New Agent</h2>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary" style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Username (login identifier)</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. john_doe"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  required
                  className="form-input"
                  placeholder="e.g. 9876543210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. john@fieldwatt.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  className="form-input"
                  placeholder="Min 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Create Agent Profile
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingAgent && (
        <div className="modal-overlay" onClick={() => { setShowEditModal(false); setEditingAgent(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>Edit Agent Profile</h2>
              <button onClick={() => setShowEditModal(false)} className="btn btn-secondary" style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="form-input"
                  value={editingAgent.name}
                  onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Username (login identifier)</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={editingAgent.username || ''}
                  onChange={(e) => setEditingAgent({ ...editingAgent, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  required
                  className="form-input"
                  value={editingAgent.phone}
                  onChange={(e) => setEditingAgent({ ...editingAgent, phone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={editingAgent.email || ''}
                  onChange={(e) => setEditingAgent({ ...editingAgent, email: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={editingAgent.is_active}
                  onChange={(e) => setEditingAgent({ ...editingAgent, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="edit_is_active" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Active Status Enabled</label>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Save Profile Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Contractor Access Modal */}
      {editingContractor && (
        <div className="modal-overlay" onClick={() => setEditingContractor(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>
                Manage Agent Access — {editingContractor.username}
              </h2>
              <button onClick={() => setEditingContractor(null)} className="btn btn-secondary" style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditAgents} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">Currently Assigned Agents ({editAgentIds.length})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {editAgentIds.map(id => {
                    const ag = agents.find(a => a.id === id);
                    return (
                      <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '12px', background: 'var(--accent3-light)', color: 'var(--accent3)', fontSize: '12px', fontWeight: '600' }}>
                        {ag ? ag.name : id}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditAgentIds(prev => prev.filter(x => x !== id))} />
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Add More Agents</label>
                <input
                  type="text"
                  placeholder="Search agents by name or username..."
                  className="form-input"
                  value={editAgentSearch}
                  onChange={(e) => setEditAgentSearch(e.target.value)}
                />

                <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '6px', background: 'var(--surface)' }}>
                  {agents
                    .filter(a => !editAgentIds.includes(a.id))
                    .filter(a => !editAgentSearch || a.name.toLowerCase().includes(editAgentSearch.toLowerCase()) || (a.username && a.username.toLowerCase().includes(editAgentSearch.toLowerCase())))
                    .map(a => (
                      <div
                        key={a.id}
                        onClick={() => setEditAgentIds(prev => [...prev, a.id])}
                        style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <span style={{ fontWeight: '600' }}>+ {a.name}</span>
                        <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{a.username || a.phone}</span>
                      </div>
                    ))}
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Save Access Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Contractor Password Modal */}
      {resetPwContractor && (
        <div className="modal-overlay" onClick={() => setResetPwContractor(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>
                Reset Password — {resetPwContractor.username}
              </h2>
              <button onClick={() => setResetPwContractor(null)} className="btn btn-secondary" style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Min 6 characters"
                  className="form-input"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Reset Password
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Agents;
