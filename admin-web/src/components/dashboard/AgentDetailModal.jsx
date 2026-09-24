import React from 'react';
import { X, ZoomIn, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DashboardSkeleton } from '../Skeleton';

const AgentDetailModal = ({ viewingAgent, setViewingAgent, agentReadings, loadingReadings, openReadingModal, setZoomPhoto }) => {
  if (!viewingAgent) return null;

  return (
    <div className="modal-overlay" onClick={() => setViewingAgent(null)}>
      <div className="modal-content" style={{ maxWidth: '800px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>{viewingAgent.name} - Cycle Submissions</h2>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>{viewingAgent.phone} — Activity log & uploads</p>
          </div>
          <Button variant="secondary" onClick={() => setViewingAgent(null)} style={{ padding: '4px', cursor: 'pointer' }}>
            <X size={16} />
          </Button>
        </div>

        {loadingReadings ? (
          <div style={{ padding: '40px 0' }}><DashboardSkeleton /></div>
        ) : (
          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '16px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>BP No</th>
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
                    <tr
                      key={reading.reading_id}
                      onClick={() => openReadingModal(reading)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: '600', color: 'var(--text)' }}>{reading.bp_no || reading.serial_no}</td>
                      <td>{reading.consumer_name}</td>
                      <td>
                        <Badge variant={reading.status_code === 'reading_taken' ? 'success' : 'danger'}>
                          {reading.status_code.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td style={{ fontWeight: '600' }}>
                        {reading.reading_value !== null ? reading.reading_value : '-'}
                      </td>
                      <td>
                        {reading.photo_url ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setZoomPhoto(reading.photo_url); }}
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
  );
};

export default AgentDetailModal;
