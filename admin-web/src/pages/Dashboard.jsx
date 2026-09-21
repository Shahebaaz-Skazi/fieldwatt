import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../utils/api';
import GlobalSearch from '../components/dashboard/GlobalSearch';
import ZoomPhotoModal from '../components/dashboard/ZoomPhotoModal';
import AgentDetailModal from '../components/dashboard/AgentDetailModal';
import LeaveReassignmentModal from '../components/dashboard/LeaveReassignmentModal';
import SelfReadingsModal from '../components/dashboard/SelfReadingsModal';
import PropertyReadingModal from '../components/dashboard/PropertyReadingModal';
import ViewerExportGrid from '../components/dashboard/ViewerExportGrid';
import { Users, UserCheck, CalendarDays, CheckCircle2, Clock, AlertTriangle, Eye, ShieldAlert, X, RefreshCw, ZoomIn, Search, FileDown, Database } from 'lucide-react';
import { applyAdminWatermark } from '../utils/watermark';
import { DashboardSkeleton } from '../components/Skeleton';

const Dashboard = ({ viewerMode = false }) => {
  const [data, setData] = useState({
    active_cycle_id: null,
    agents: [],
    summary: { total_agents: 0, present_agents: 0, leave_agents: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Cycle selector state
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState(() => localStorage.getItem('fw_selected_cycle_id') || '');

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

  // Customer self readings modal state
  const [viewingSelfReadings, setViewingSelfReadings] = useState(false);
  const [selfReadings, setSelfReadings] = useState([]);
  const [loadingSelfReadings, setLoadingSelfReadings] = useState(false);

  // Campaign progress (WhatsApp self-reading funnel)
  const [campaign, setCampaign] = useState({ total: 0, dispatched: 0, readings_submitted: 0, pending: 0 });

  // Photo edit states
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [editPhotoWatermarkApplied, setEditPhotoWatermarkApplied] = useState(false);
  const [editPhotoUploading, setEditPhotoUploading] = useState(false);


  // Editable modal fields
  const [editReadingValue, setEditReadingValue] = useState('');
  const [editStatusCode, setEditStatusCode] = useState('reading_taken');
  const [editNote, setEditNote] = useState('');
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [saveModalLoading, setSaveModalLoading] = useState(false);

  const closeReadingModal = () => {
    setViewingReading(null);
    setEditingPhoto(false);
    setEditPhotoWatermarkApplied(false);
  };

  const openReadingModal = (prop) => {
    setViewingReading(prop);
    setEditReadingValue(prop.reading_value !== null && prop.reading_value !== undefined ? prop.reading_value.toString() : '');
    setEditStatusCode(prop.status_code || 'reading_taken');
    setEditNote(prop.note || '');
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(prop.photo_url || null);
    setEditingPhoto(false);
    setEditPhotoWatermarkApplied(false);
  };

  const handleExport = async () => {
    if (!selectedMru || !selectedYear || !selectedMonth) {
      toast.error('Please select MRU, Year, and Month first.');
      return;
    }
    
    setExportMruLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const params = new URLSearchParams({ mru: selectedMru, year: selectedYear, month: selectedMonth });
      const feeRes = await fetch(`${api.API_BASE_URL}/admin/assignments/calculate-fee?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const feeJson = await feeRes.json();
      
      if (feeJson.paywallEnabled && feeJson.totalAmount > 0) {
        setFeeData(feeJson);
        setPaywallPayload({ mru: selectedMru, year: selectedYear, month: selectedMonth });
        setPaywallSuccessCallback(() => () => executeRealExport());
        setPaywallOpen(true);
        setExportMruLoading(false);
        return;
      }
      await executeRealExport();
    } catch(err) {
      toast.error('Failed to check export fee: ' + err.message);
      setExportMruLoading(false);
    }
  };
  
  const executeRealExport = async () => {
  // Paywall bypass logic wrapper applied
    if (!selectedMru || !selectedYear || !selectedMonth) {
      toast.error('Please select MRU, Year, and Month first.');
      return;
    }

    try {
      setExportMruLoading(true);
      const token = localStorage.getItem('admin_token');
      const params = new URLSearchParams({ mru: selectedMru, year: selectedYear, month: selectedMonth });

      const response = await fetch(`${api.API_BASE_URL}/admin/assignments/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        let errorMsg = 'Export failed';
        try {
          const err = await response.json();
          errorMsg = err.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `FieldWatt_Export_${selectedMru}_${selectedMonth}_${selectedYear}.xlsx`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExportMruLoading(false);
    }
  };

  const handleDownloadImages = async () => {
    if (!imageYear || !imageMonth) {
      toast.error('Please select Year and Month first.');
      return;
    }

    try {
      setDownloadImagesLoading(true);
      const token = localStorage.getItem('admin_token');
      const params = new URLSearchParams({
        mru: imageMru,
        year: imageYear,
        month: imageMonth,
        society: imageSociety,
        q: imageQuery
      });

      const response = await fetch(`${api.API_BASE_URL}/admin/dashboard/download-images?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = 'Failed to download images.';
        try {
          const errJson = JSON.parse(text);
          errorMsg = errJson.error || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthName = imageMonth ? (monthNames[parseInt(imageMonth) - 1] || imageMonth) : 'Cycle';
      const mruLabel = imageMru && imageMru !== 'all' ? imageMru : 'ALL';

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${mruLabel}_${monthName}_${imageYear || '2026'}.zip`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      toast.error('Download failed: ' + err.message);
    } finally {
      setDownloadImagesLoading(false);
    }
  };

  const openSelfReadingsModal = async () => {
    try {
      setViewingSelfReadings(true);
      setLoadingSelfReadings(true);
      const res = await api.get('/admin/dashboard/self-readings');
      setSelfReadings(res || []);
    } catch (err) {
      toast.error('Failed to fetch self-readings: ' + err.message);
    } finally {
      setLoadingSelfReadings(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const ts = Date.now();
      const [response, progress] = await Promise.all([
        api.get(`/admin/dashboard?_t=${ts}`),
        api.get(`/admin/dashboard/campaign-progress?_t=${ts}`),
      ]);
      setData(response);
      setCampaign(progress);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch all cycles once on mount
  useEffect(() => {
    api.get('/admin/assignments/cycles')
      .then(list => setCycles(list || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData(), 600000); // refresh every 10 minutes
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setViewingAgent(null);
        setReassignAgent(null);
        setZoomPhoto(null);
        closeReadingModal();
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



  if (loading) {
    return <DashboardSkeleton />;
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
          <h1 className="page-title">{viewerMode ? "MNGL Data Portal — Search & Export" : "Live Field Operations"}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
            {viewerMode ? "Search properties and download meter reading verification photos" : "Real-time overview of current cycle activities and agent status"}
          </p>
        </div>
        
      </div>

      {viewerMode && (
        <div style={{ background: 'rgba(79,156,249,0.1)', border: '1px solid #4f9cf9', borderRadius: '10px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>🏢</span>
          <div>
            <div style={{ fontWeight: '600', color: '#4f9cf9', fontSize: '14px' }}>MNGL Data Portal</div>
            <div style={{ color: 'var(--muted)', fontSize: '12px' }}>You have access to property search and meter image downloads only.</div>
          </div>
        </div>
      )}

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

      <GlobalSearch openReadingModal={openReadingModal} setZoomPhoto={setZoomPhoto} />

            <ViewerExportGrid viewerMode={viewerMode} />

      {!viewerMode && (
        <>
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

            <div className="widget-card" style={{ display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: '12px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="widget-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent3)', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={18} />
                </div>
                <span className="widget-title" style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)', margin: 0, textTransform: 'uppercase' }}>Data Progress</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                {data.summary.data_stats?.cycle_breakdown?.map(c => (
                  <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text)' }}>{c.name}</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                      <span>Tot: <strong style={{color: 'var(--text)'}}>{c.total.toLocaleString()}</strong></span>
                      <span>Dn: <strong style={{color: 'var(--accent3)'}}>{c.completed.toLocaleString()}</strong></span>
                      <span>Pd: <strong style={{color: 'var(--accent4)'}}>{c.pending.toLocaleString()}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                 <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text)' }}>TOTAL DATA</span>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                    <span>Tot: <strong style={{color: 'var(--text)'}}>{(data.summary.data_stats?.global?.total || 0).toLocaleString()}</strong></span>
                    <span>Dn: <strong style={{color: 'var(--accent3)'}}>{(data.summary.data_stats?.global?.completed || 0).toLocaleString()}</strong></span>
                    <span>Pd: <strong style={{color: 'var(--accent4)'}}>{(data.summary.data_stats?.global?.pending || 0).toLocaleString()}</strong></span>
                 </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Self-Reading Campaign Progress */}
          {!viewerMode && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '24px',
              boxShadow: 'var(--shadow)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>
                    📱 Global WhatsApp Self-Reading
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>WhatsApp links dispatched → customer submissions received</p>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Auto-refreshes every 10 min</span>
              </div>

              {/* Progress bars Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                {/* 1. WhatsApp Coverage */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>WhatsApp Coverage</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)' }}>
                      {campaign.dispatched} / {campaign.total}
                      <span style={{ fontWeight: '400', color: 'var(--muted)', marginLeft: '6px' }}>
                        ({campaign.total > 0 ? Math.round((campaign.dispatched / campaign.total) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${campaign.total > 0 ? (campaign.dispatched / campaign.total) * 100 : 0}%`,
                      height: '100%',
                      background: '#4f9cf9',
                      borderRadius: '5px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>

                {/* 2. Readings Submitted */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Readings Submitted</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)' }}>
                      {campaign.readings_submitted} / {campaign.total}
                      <span style={{ fontWeight: '400', color: 'var(--muted)', marginLeft: '6px' }}>
                        ({campaign.total > 0 ? Math.round((campaign.readings_submitted / campaign.total) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${campaign.total > 0 ? (campaign.readings_submitted / campaign.total) * 100 : 0}%`,
                      height: '100%',
                      background: 'var(--accent3)',
                      borderRadius: '5px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              </div>

              {/* 4 stat boxes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div style={{ background: 'rgba(243,244,246,0.5)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{campaign.total}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>🏢 Total Properties</div>
                </div>
                <div style={{ background: 'rgba(79,156,249,0.08)', border: '1px solid rgba(79,156,249,0.2)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#4f9cf9', fontFamily: 'var(--font-display)' }}>{campaign.dispatched}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>📤 Links Sent</div>
                </div>
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#f59e0b', fontFamily: 'var(--font-display)' }}>{campaign.total - campaign.dispatched}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>⏳ Pending Send</div>
                </div>
                <div 
                  onClick={openSelfReadingsModal}
                  style={{ 
                    background: 'rgba(16,185,129,0.08)', 
                    border: '1px solid rgba(16,185,129,0.2)', 
                    borderRadius: '10px', 
                    padding: '16px', 
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.background = 'rgba(16,185,129,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.background = 'rgba(16,185,129,0.08)';
                  }}
                >
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent3)', fontFamily: 'var(--font-display)' }}>{campaign.readings_submitted}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    ✅ Readings Received <Eye size={12} style={{ color: 'var(--accent3)' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

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
        </>
      )}

      <AgentDetailModal viewingAgent={viewingAgent} setViewingAgent={setViewingAgent} agentReadings={agentReadings} loadingReadings={loadingReadings} openReadingModal={openReadingModal} setZoomPhoto={setZoomPhoto} />

      <SelfReadingsModal 
        viewingSelfReadings={viewingSelfReadings} 
        setViewingSelfReadings={setViewingSelfReadings} 
        loadingSelfReadings={loadingSelfReadings} 
        selfReadings={selfReadings} 
        setZoomPhoto={setZoomPhoto} 
      />

      <LeaveReassignmentModal reassignAgent={reassignAgent} setReassignAgent={setReassignAgent} pendingProps={pendingProps} setPendingProps={setPendingProps} targetAgentId={targetAgentId} setTargetAgentId={setTargetAgentId} data={data} handleReassignmentSubmit={handleReassignmentSubmit} reassigning={reassigning} />

      <ZoomPhotoModal zoomPhoto={zoomPhoto} setZoomPhoto={setZoomPhoto} />

      <PropertyReadingModal 
        viewingReading={viewingReading} 
        setViewingReading={setViewingReading} 
        setZoomPhoto={setZoomPhoto} 
      />
    </div>
  );
};

export default Dashboard;
