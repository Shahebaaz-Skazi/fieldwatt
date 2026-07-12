import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { AlertTriangle, ShieldCheck, RefreshCw, ZoomIn, EyeOff, CalendarDays, CheckCircle2 } from 'lucide-react';

const Alerts = () => {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Zoom photo state
  const [zoomPhoto, setZoomPhoto] = useState(null);

  const fetchAnomalies = async () => {
    try {
      const data = await api.get('/admin/dashboard/anomalies');
      setAnomalies(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch anomalies list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, []);

  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this reading? This will clear the anomaly alert.')) return;

    setError('');
    setSuccess('');
    try {
      await api.patch(`/admin/dashboard/readings/${id}/approve`);
      setSuccess('Reading approved successfully. Anomaly flag cleared.');
      fetchAnomalies();
    } catch (err) {
      setError(err.message || 'Failed to approve reading.');
    }
  };

  const handleRevisit = async (id) => {
    if (!window.confirm('Are you sure you want to schedule a revisit for this property?')) return;

    setError('');
    setSuccess('');
    try {
      await api.post(`/admin/dashboard/readings/${id}/revisit`);
      setSuccess('Revisit scheduled successfully. The property will be flagged for agent reassignment.');
      fetchAnomalies();
    } catch (err) {
      setError(err.message || 'Failed to schedule revisit.');
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>Loading anomaly alerts...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={28} style={{ color: 'var(--accent4)' }} />
            Anomaly Alerts
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Verify geo-proximity violations and suspicious register values</p>
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

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Serial</th>
              <th>Consumer Name</th>
              <th>Address</th>
              <th>Assigned Agent</th>
              <th>Reading value</th>
              <th>Anomaly Cause</th>
              <th>Photo</th>
              <th style={{ textAlign: 'right' }}>Review Actions</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={24} style={{ color: 'var(--accent3)' }} />
                    <span>No anomaly flags detected in this billing cycle! Clean operations.</span>
                  </div>
                </td>
              </tr>
            ) : (
              anomalies.map((a) => (
                <tr key={a.reading_id}>
                  <td style={{ fontWeight: '600', color: 'var(--text)' }}>{a.serial_no}</td>
                  <td>{a.consumer_name}</td>
                  <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.address}</td>
                  <td>{a.agent_name}</td>
                  <td style={{ fontWeight: '600' }}>
                    {a.reading_value !== null ? `${a.reading_value} kWh` : '-'}
                  </td>
                  <td style={{ color: 'var(--accent4)', fontSize: '13px', fontWeight: '500', maxWidth: '250px' }}>
                    {a.anomaly_reason}
                  </td>
                  <td>
                    {a.photo_url ? (
                      <button 
                        onClick={() => setZoomPhoto(a.photo_url)} 
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none' }}
                      >
                        <ZoomIn size={14} />
                        <span style={{ fontSize: '12px', textDecoration: 'underline' }}>View Photo</span>
                      </button>
                    ) : '-'}
                  </td>
                  <td style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleApprove(a.reading_id)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', color: 'var(--accent3)', borderColor: 'rgba(16, 185, 129, 0.2)' }}
                      title="Clear anomaly flag and accept value"
                    >
                      <ShieldCheck size={14} style={{ marginRight: '4px' }} />
                      Clear Alert
                    </button>
                    <button
                      onClick={() => handleRevisit(a.reading_id)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', color: 'var(--accent)', borderColor: 'rgba(245, 166, 35, 0.2)' }}
                      title="Schedule properties revisit task"
                    >
                      <CalendarDays size={14} style={{ marginRight: '4px' }} />
                      Revisit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
};

export default Alerts;
