import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

const LeaveReassignmentModal = ({
  reassignAgent,
  setReassignAgent,
  pendingProps,
  setPendingProps,
  targetAgentId,
  setTargetAgentId,
  data,
  handleReassignmentSubmit,
  reassigning
}) => {
  if (!reassignAgent) return null;

  return (
    <div className="modal-overlay" onClick={() => { setReassignAgent(null); setPendingProps([]); }}>
      <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text)' }}>Reassign Pending Work</h2>
          <Button variant="secondary" onClick={() => { setReassignAgent(null); setPendingProps([]); }} style={{ padding: '4px', cursor: 'pointer' }}>
            <X size={16} />
          </Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0' }}>
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
                BP No. {p.bp_no || p.serial_no} — {p.consumer_name}
              </div>
            ))}
          </div>

          <Button
            type="submit"
            disabled={reassigning || !targetAgentId}
            style={{ width: '100%' }}
          >
            {reassigning ? 'Reassigning...' : `Transfer ${pendingProps.length} Assignments`}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LeaveReassignmentModal;
