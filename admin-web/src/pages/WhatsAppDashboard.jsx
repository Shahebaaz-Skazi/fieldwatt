import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { MessageSquare, Send, CheckCircle2, AlertCircle, RefreshCw, CheckSquare, Square, Filter } from 'lucide-react';

const WhatsAppDashboard = () => {
  const [usage, setUsage] = useState({ sentThisMonth: 0, count: 0, limit: 1000 });
  const [logs, setLogs] = useState([]);
  const [replies, setReplies] = useState([]);
  const [areas, setAreas] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [properties, setProperties] = useState([]);
  const [societies, setSocieties] = useState([]);
  const [selectedSociety, setSelectedSociety] = useState('');

  const [selectedPropIds, setSelectedPropIds] = useState(new Set());
  const [phoneNumbers, setPhoneNumbers] = useState({});

  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState('');

  const fetchUsageAndLogs = async () => {
    try {
      setLoadingUsage(true);
      const [uData, lData, rData] = await Promise.all([
        api.get('/admin/whatsapp/status'),
        api.get('/admin/whatsapp/logs'),
        api.get('/admin/whatsapp/replies').catch(() => [])
      ]);
      setUsage(uData);
      setLogs(lData);
      setReplies(rData || []);
    } catch (err) {
      console.error('Failed to fetch usage/logs:', err);
    } finally {
      setLoadingUsage(false);
    }
  };

  const fetchAreas = async () => {
    try {
      const data = await api.get('/admin/areas');
      setAreas(data);
      if (data.length > 0) {
        setSelectedAreaId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch areas:', err);
    }
  };

  useEffect(() => {
    fetchUsageAndLogs();
    fetchAreas();
  }, []);

  // Fetch societies list when selectedAreaId changes
  useEffect(() => {
    if (!selectedAreaId) return;
    api.get(`/admin/areas/${selectedAreaId}/societies`)
      .then(socList => {
        if (Array.isArray(socList)) setSocieties(socList);
      })
      .catch(() => {});
    setSelectedSociety('');
  }, [selectedAreaId]);

  // Fetch properties when selectedAreaId or selectedSociety changes
  useEffect(() => {
    if (!selectedAreaId) return;

    const fetchProps = async () => {
      setLoadingProperties(true);
      setError('');
      try {
        const queryUrl = `/admin/areas/${selectedAreaId}/properties?limit=1000${selectedSociety ? `&society=${encodeURIComponent(selectedSociety)}` : ''}`;
        const response = await api.get(queryUrl);
        const propList = response.properties || [];
        setProperties(propList);

        const initialPhones = {};
        propList.forEach(p => {
          if (p.phone_number) initialPhones[p.id] = p.phone_number;
        });
        setPhoneNumbers(prev => ({ ...initialPhones, ...prev }));
        setSelectedPropIds(new Set());
      } catch (err) {
        setError(err.message || 'Failed to load properties for selected area.');
      } finally {
        setLoadingProperties(false);
      }
    };

    fetchProps();
  }, [selectedAreaId, selectedSociety]);

  // Filtered properties list: phone_number is not null and reading is not yet completed
  const filteredProperties = properties.filter(p => {
    const phone = phoneNumbers[p.id] || p.phone_number;
    if (!phone) return false;
    if (selectedSociety && p.society !== selectedSociety) return false;
    
    // Reading is not yet completed (reading_taken or completed status codes count as completed)
    if (p.reading_status === 'reading_taken' || p.reading_status === 'completed') return false;
    return true;
  });

  const handleToggleSelectAll = () => {
    if (selectedPropIds.size === filteredProperties.length && filteredProperties.length > 0) {
      setSelectedPropIds(new Set());
    } else {
      setSelectedPropIds(new Set(filteredProperties.map(p => p.id)));
    }
  };

  const handleToggleSelect = (id) => {
    const next = new Set(selectedPropIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPropIds(next);
  };

  const handlePhoneChange = (id, val) => {
    setPhoneNumbers(prev => ({ ...prev, [id]: val }));
  };

  const handleSendMessages = async () => {
    const idsToSubmit = Array.from(selectedPropIds);
    if (idsToSubmit.length === 0) {
      alert('Please select at least one property to send WhatsApp message.');
      return;
    }

    const confirmMsg = `Are you sure you want to send WhatsApp self-reading requests to ${idsToSubmit.length} customer(s)?\nThis will use ${idsToSubmit.length} message(s) from your monthly quota (${usage.sentThisMonth}/${usage.limit}).`;
    if (!window.confirm(confirmMsg)) return;

    setSending(true);
    setSendResult(null);
    setError('');

    try {
      const payload = {
        propertyIds: idsToSubmit,
        phoneNumbers: phoneNumbers
      };

      const res = await api.post('/admin/whatsapp/send-bulk', payload);
      setSendResult(res);
      fetchUsageAndLogs();
    } catch (err) {
      setError(err.message || 'Failed to send WhatsApp messages.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp Customer Self-Reading</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
            Dispatch automated meter reading request links directly to consumers via WhatsApp
          </p>
        </div>
      </div>

      {/* Section 1: Usage Meter */}
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>Monthly Quota Usage</h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
              {usage.sentThisMonth.toLocaleString()} / {usage.limit.toLocaleString()} WhatsApp messages dispatched this month
            </p>
          </div>
          <button onClick={fetchUsageAndLogs} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
            <RefreshCw size={14} className={loadingUsage ? 'spinning' : ''} />
            Refresh
          </button>
        </div>

        <div style={{ width: '100%', height: '10px', background: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, (usage.sentThisMonth / usage.limit) * 100)}%`,
            height: '100%',
            background: usage.sentThisMonth > 900 ? 'var(--accent4)' : 'var(--accent)',
            borderRadius: '5px',
            transition: 'width 0.3s ease'
          }} />
        </div>

        {usage.sentThisMonth > 900 && (
          <p style={{ color: 'var(--accent4)', fontSize: '12px', fontWeight: '600' }}>
            Warning: You are approaching your monthly Meta Cloud API quota limit.
          </p>
        )}
      </div>

      {/* Section 2: Send Messages Panel */}
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)' }}>Dispatch Self-Reading Links</h2>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500' }}>Select Area Zone:</label>
            <select
              className="form-input"
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
              style={{ minWidth: '180px', padding: '8px 12px', fontSize: '13px' }}
            >
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500' }}>Filter Society:</label>
            <select
              className="form-input"
              value={selectedSociety}
              onChange={(e) => setSelectedSociety(e.target.value)}
              style={{ minWidth: '180px', padding: '8px 12px', fontSize: '13px' }}
            >
              <option value="">All Societies</option>
              {societies.map(s => {
                const sName = typeof s === 'string' ? s : s.name;
                const sCount = typeof s === 'object' && s.count !== undefined ? s.count : null;
                return (
                  <option key={sName} value={sName}>
                    {sName} {sCount !== null ? `(${sCount.toLocaleString()})` : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent4)', borderRadius: '8px', border: '1px solid var(--accent4)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {sendResult && (
          <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent3)', borderRadius: '8px', border: '1px solid var(--accent3)', fontSize: '13px' }}>
            WhatsApp dispatch completed: <strong>{sendResult.sent} sent</strong>, <strong>{sendResult.failed} failed</strong>.
          </div>
        )}

        {/* Properties Table */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleToggleSelectAll} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              {selectedPropIds.size === filteredProperties.length && filteredProperties.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {selectedPropIds.size} of {filteredProperties.length} properties selected
            </span>
          </div>

          <button
            onClick={handleSendMessages}
            disabled={sending || selectedPropIds.size === 0}
            className="btn btn-primary"
            style={{ padding: '8px 16px', opacity: sending || selectedPropIds.size === 0 ? 0.6 : 1 }}
          >
            <Send size={15} />
            {sending ? 'Sending WhatsApp Requests...' : `Send to ${selectedPropIds.size} Consumers`}
          </button>
        </div>

        <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
          {loadingProperties ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
              <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 8px', animation: 'spin 1.5s linear infinite' }} />
              <span>Loading area properties...</span>
            </div>
          ) : filteredProperties.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
              No pending properties with phone numbers match the selected filters.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>Select</th>
                  <th>Consumer Name</th>
                  <th>Address</th>
                  <th>Meter No</th>
                  <th>WhatsApp Phone Number</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProperties.map(p => {
                  const isChecked = selectedPropIds.has(p.id);
                  return (
                    <tr key={p.id} style={{ backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(p.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ fontWeight: '600', color: 'var(--text)' }}>{p.consumer_name}</td>
                      <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{p.address}</td>
                      <td>{p.meter_no || 'N/A'}</td>
                      <td>
                        <input
                          type="text"
                          placeholder="e.g. 9876543210"
                          value={phoneNumbers[p.id] || ''}
                          onChange={(e) => handlePhoneChange(p.id, e.target.value)}
                          className="form-input"
                          style={{ padding: '4px 8px', fontSize: '12px', width: '140px' }}
                        />
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                          textTransform: 'capitalize',
                          backgroundColor: p.reading_status === 'reading_taken' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: p.reading_status === 'reading_taken' ? 'var(--accent3)' : 'var(--accent4)'
                        }}>
                          {p.reading_status ? p.reading_status.replace('_', ' ') : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Section 3: Message Log Table */}
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)' }}>Dispatch History</h2>

        <div className="table-container">
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
              No WhatsApp messages sent yet.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Consumer Name</th>
                  <th>Phone Number</th>
                  <th>Status</th>
                  <th>Sent At</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: '600', color: 'var(--text)' }}>{log.consumer_name || 'Consumer'}</td>
                    <td>{log.phone_number}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'capitalize',
                        backgroundColor: log.status === 'delivered' ? 'rgba(16, 185, 129, 0.15)' : log.status === 'sent' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: log.status === 'delivered' ? 'var(--accent3)' : log.status === 'sent' ? 'var(--accent)' : 'var(--accent4)'
                      }}>
                        {log.status}
                      </span>
                    </td>
                    <td>{new Date(log.sent_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Section 4: Customer Replies Log Table */}
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)' }}>💬 Incoming Customer Replies (Direct Text Messages)</h2>
        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '-8px' }}>
          Text replies sent back directly by customers on WhatsApp (these are not the meter reading forms).
        </p>

        <div className="table-container">
          {replies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
              No direct customer replies logged yet.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Sender Profile</th>
                  <th>Phone Number</th>
                  <th>Message Reply</th>
                  <th>Received At</th>
                </tr>
              </thead>
              <tbody>
                {replies.map(reply => (
                  <tr key={reply.id}>
                    <td style={{ fontWeight: '600', color: 'var(--text)' }}>{reply.profile_name || 'Anonymous Customer'}</td>
                    <td>{reply.phone_number}</td>
                    <td style={{ color: 'var(--text)', fontStyle: 'italic', fontWeight: '500' }}>"{reply.message_body}"</td>
                    <td>{new Date(reply.received_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppDashboard;
