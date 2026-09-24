import React from 'react';
import { X, ZoomIn } from 'lucide-react';
import { Button } from '../ui/Button';
import { DashboardSkeleton } from '../Skeleton';

const SelfReadingsModal = ({ viewingSelfReadings, setViewingSelfReadings, loadingSelfReadings, selfReadings, setZoomPhoto }) => {
  if (!viewingSelfReadings) return null;

  return (
    <div className="modal-overlay" onClick={() => setViewingSelfReadings(false)}>
      <div className="modal-content" style={{ maxWidth: '900px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>📱 Customer Self-Readings</h2>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>List of all meter readings submitted directly by customers on WhatsApp</p>
          </div>
          <Button variant="secondary" onClick={() => setViewingSelfReadings(false)} style={{ padding: '4px', cursor: 'pointer' }}>
            <X size={16} />
          </Button>
        </div>

        {loadingSelfReadings ? (
          <div style={{ padding: '40px 0' }}><DashboardSkeleton /></div>
        ) : (
          <div className="table-container" style={{ maxHeight: '450px', overflowY: 'auto', marginTop: '16px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Consumer Name</th>
                  <th>Phone Number</th>
                  <th>Meter No</th>
                  <th>Reading Value</th>
                  <th>Meter Image</th>
                  <th>Note</th>
                  <th>Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {selfReadings.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No customer self-readings submitted yet in this cycle.</td>
                  </tr>
                ) : (
                  selfReadings.map((reading, idx) => (
                    <tr key={reading.reading_id || idx}>
                      <td style={{ fontWeight: '600', color: 'var(--text)' }}>{reading.consumer_name}</td>
                      <td>{reading.phone_number}</td>
                      <td><code>{reading.meter_no}</code></td>
                      <td style={{ fontWeight: '700', color: 'var(--accent3)' }}>
                        {reading.reading_value !== null ? reading.reading_value : '-'}
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
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>No Photo</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{reading.note || '-'}</td>
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

export default SelfReadingsModal;
