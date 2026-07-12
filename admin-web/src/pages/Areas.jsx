import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { 
  ArrowLeft, Search, Filter, Home, Landmark, Building2, MapPin, X, User, 
  Zap, AlertTriangle, CheckCircle, Clock, FileText, Calendar, CheckSquare, 
  Plus, ChevronRight, RefreshCw, Sparkles, BookOpen, AlertCircle
} from 'lucide-react';

const Areas = () => {
  // Navigation level states
  // 'files' -> 'months' -> 'areas' -> 'seats'
  const [level, setLevel] = useState('files');
  const [fileCodes, setFileCodes] = useState([]);
  const [selectedFileCode, setSelectedFileCode] = useState('');
  const [months, setMonths] = useState([]);
  const [selectedImportId, setSelectedImportId] = useState('');
  const [selectedImport, setSelectedImport] = useState(null);
  const [areas, setAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState(null);

  // Level 4 Seats & Properties states
  const [seats, setSeats] = useState([]);
  const [societies, setSocieties] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selected single property for detail panel
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [loadingPropertyDetail, setLoadingPropertyDetail] = useState(false);

  // Left column Filter inputs
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [selectedSociety, setSelectedSociety] = useState('');
  const [filterAgentId, setFilterAgentId] = useState('');

  // Dual-column assignment state
  const [leftCheckedIds, setLeftCheckedIds] = useState(new Set());
  const [assignedColumnIds, setAssignedColumnIds] = useState([]);
  const [targetAgentId, setTargetAgentId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [activeCycleId, setActiveCycleId] = useState(null);

  // Admin manual reading inputs
  const [adminStatusCode, setAdminStatusCode] = useState('reading_taken');
  const [adminReadingValue, setAdminReadingValue] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [adminPhotoUrl, setAdminPhotoUrl] = useState('');
  const [submittingReading, setSubmittingReading] = useState(false);

  // Fetch Level 1: File Codes
  const fetchFileCodes = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/admin/areas/files');
      setFileCodes(data);
    } catch (err) {
      setError(err.message || 'Error fetching file directory.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Level 2: Months under file code
  const fetchMonths = async (code) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/admin/areas/files/${code}/months`);
      setMonths(data);
    } catch (err) {
      setError(err.message || 'Error fetching billing cycles.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Level 3: Areas under import
  const fetchAreas = async (importId) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/admin/areas/imports/${importId}/areas`);
      setAreas(data);
    } catch (err) {
      setError(err.message || 'Error fetching areas.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Level 4: Seats, Societies, Agents
  const fetchSeatsAndDetails = async (importId, areaId) => {
    setLoading(true);
    setError('');
    try {
      const seatsRes = await api.get(`/admin/areas/imports/${importId}/areas/${areaId}/seats`);
      setSeats(seatsRes.properties);
      setActiveCycleId(seatsRes.cycleId);

      const societiesRes = await api.get(`/admin/areas/imports/${importId}/areas/${areaId}/societies`);
      setSocieties(societiesRes);

      const agentsRes = await api.get('/admin/agents');
      setAgents(agentsRes.filter(a => a.is_active));
    } catch (err) {
      setError(err.message || 'Error loading zone configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch expanded single property details
  const fetchPropertyDetail = async (propId) => {
    setLoadingPropertyDetail(true);
    try {
      const response = await api.get(`/admin/areas/property/${propId}`);
      setSelectedProperty(response);
    } catch (err) {
      console.error('Error fetching property detail:', err);
    } finally {
      setLoadingPropertyDetail(false);
    }
  };

  // Sync form states with selected property
  useEffect(() => {
    if (selectedProperty) {
      setAdminStatusCode(selectedProperty.reading_status || 'reading_taken');
      setAdminReadingValue(selectedProperty.reading_value !== null && selectedProperty.reading_value !== undefined ? String(selectedProperty.reading_value) : '');
      setAdminNote(selectedProperty.reading_note || '');
      setAdminPhotoUrl(selectedProperty.photo_url || '');
    }
  }, [selectedProperty]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file);

    setSubmittingReading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/admin/areas/upload-photo', formData);
      setAdminPhotoUrl(response.photoUrl);
      setSuccess('Photo uploaded successfully!');
    } catch (err) {
      setError(err.message || 'Failed to upload photo.');
    } finally {
      setSubmittingReading(false);
    }
  };

  const handleSaveAdminReading = async () => {
    if (!selectedProperty) return;
    setSubmittingReading(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/admin/areas/property/${selectedProperty.id}/reading`, {
        status_code: adminStatusCode,
        reading_value: adminStatusCode === 'reading_taken' ? adminReadingValue : null,
        note: adminNote,
        photo_url: adminPhotoUrl
      });
      setSuccess('Reading logged successfully!');
      // Refresh expanded property view
      fetchPropertyDetail(selectedProperty.id);
      // Refresh main list
      fetchSeatsAndDetails(selectedImportId, selectedArea.id);
    } catch (err) {
      setError(err.message || 'Failed to save reading.');
    } finally {
      setSubmittingReading(false);
    }
  };

  // Mount
  useEffect(() => {
    if (level === 'files') {
      fetchFileCodes();
    }
  }, [level]);

  // Key Event Listener: Ctrl+A / Cmd+A for Left Column
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if inside input fields to prevent hijacking normal text selection
      if (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'SELECT' ||
        document.activeElement.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        // Select all properties in the left column that are currently filtered
        const visibleLeftProps = getFilteredLeftProperties();
        const newChecked = new Set(leftCheckedIds);
        visibleLeftProps.forEach(p => newChecked.add(p.id));
        setLeftCheckedIds(newChecked);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [seats, search, type, status, selectedSociety, filterAgentId, assignedColumnIds, leftCheckedIds]);

  // Handle drill downs
  const handleSelectFile = (code) => {
    setSelectedFileCode(code);
    fetchMonths(code);
    setLevel('months');
  };

  const handleSelectMonth = (imp) => {
    setSelectedImportId(imp.import_id);
    setSelectedImport(imp);
    fetchAreas(imp.import_id);
    setLevel('areas');
  };

  const handleSelectArea = (area) => {
    setSelectedArea(area);
    fetchSeatsAndDetails(selectedImportId, area.id);
    setLevel('seats');
    // Clear selection filters
    setSearch('');
    setType('');
    setStatus('');
    setSelectedSociety('');
    setFilterAgentId('');
    setLeftCheckedIds(new Set());
    setAssignedColumnIds([]);
    setTargetAgentId('');
    setSelectedProperty(null);
  };

  const handleGoBack = () => {
    setError('');
    setSuccess('');
    if (level === 'seats') {
      fetchAreas(selectedImportId);
      setLevel('areas');
      setSelectedArea(null);
    } else if (level === 'areas') {
      fetchMonths(selectedFileCode);
      setLevel('months');
      setSelectedImport(null);
      setSelectedImportId('');
    } else if (level === 'months') {
      setLevel('files');
      setSelectedFileCode('');
    }
  };

  // Filter Left Column list
  const getFilteredLeftProperties = () => {
    return seats.filter(seat => {
      // Exclude already selected for assignment properties
      if (assignedColumnIds.includes(seat.id)) return false;

      // Filter by search
      if (search) {
        const q = search.toLowerCase();
        const matchName = seat.consumer_name?.toLowerCase().includes(q);
        const matchSerial = seat.serial_no?.toLowerCase().includes(q);
        const matchMeter = seat.meter_no?.toLowerCase().includes(q);
        const matchAddress = seat.address?.toLowerCase().includes(q);
        if (!matchName && !matchSerial && !matchMeter && !matchAddress) return false;
      }

      // Filter by property type
      if (type && seat.property_type !== type) return false;

      // Filter by status
      if (status) {
        if (status === 'pending' && seat.reading_status) return false;
        if (status === 'done' && seat.reading_status !== 'reading_taken') return false;
        if (status === 'problem' && (seat.reading_status === 'reading_taken' || !seat.reading_status)) return false;
      }

      // Filter by society
      if (selectedSociety && seat.society !== selectedSociety) return false;

      // Filter by agent currently assigned
      if (filterAgentId) {
        if (filterAgentId === 'unassigned' && seat.agent_id) return false;
        if (filterAgentId !== 'unassigned' && seat.agent_id !== filterAgentId) return false;
      }

      return true;
    });
  };

  // Toggle single left-hand row checkbox
  const toggleLeftRow = (id) => {
    const newChecked = new Set(leftCheckedIds);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setLeftCheckedIds(newChecked);
  };

  // Move Checked from Left (Filtered list) to Right (Selected List)
  const moveCheckedToRight = () => {
    const idsToMove = Array.from(leftCheckedIds);
    if (idsToMove.length === 0) return;

    setAssignedColumnIds(prev => [...prev, ...idsToMove]);
    setLeftCheckedIds(new Set());
  };

  // Move All Filtered Left to Right
  const moveAllFilteredToRight = () => {
    const visible = getFilteredLeftProperties();
    if (visible.length === 0) return;

    const idsToMove = visible.map(p => p.id);
    setAssignedColumnIds(prev => [...prev, ...idsToMove]);
    setLeftCheckedIds(new Set());
  };

  // Remove from Right column
  const removeRightProperty = (id) => {
    setAssignedColumnIds(prev => prev.filter(x => x !== id));
  };

  // Clear all Selected in Right column
  const clearRightColumn = () => {
    setAssignedColumnIds([]);
  };

  // Submit bulk assignments to backend
  const handleAssignSubmit = async () => {
    if (assignedColumnIds.length === 0) {
      setError('Please select properties to assign.');
      return;
    }
    if (!targetAgentId) {
      setError('Please select an agent to assign the selected properties.');
      return;
    }

    setAssigning(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/admin/assignments/bulk', {
        agent_id: targetAgentId,
        property_ids: assignedColumnIds,
        cycle_id: activeCycleId
      });

      setSuccess(`Successfully assigned ${response.count || assignedColumnIds.length} properties.`);
      setAssignedColumnIds([]);
      // Reload seats
      fetchSeatsAndDetails(selectedImportId, selectedArea.id);
    } catch (err) {
      setError(err.message || 'Failed to submit assignments.');
    } finally {
      setAssigning(false);
    }
  };

  const getSeatColorClass = (seat) => {
    if (!seat.reading_status) return 'seat-pending'; // gray
    if (seat.reading_status === 'reading_taken') return 'seat-done'; // green
    return 'seat-problem'; // orange/red
  };

  const getStatusLabel = (code) => {
    if (!code) return 'Pending Allocation / Reading';
    return code.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Statistics for active area details
  const totalCount = seats.length;
  const doneCount = seats.filter(s => s.reading_status === 'reading_taken').length;
  const problemCount = seats.filter(s => s.reading_status && s.reading_status !== 'reading_taken').length;
  const pendingCount = totalCount - doneCount - problemCount;

  // -------------------------------------------------------------
  // RENDERS
  // -------------------------------------------------------------

  // LEVEL 1: File cards view
  if (level === 'files') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Area Directory & Ingestion files</h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Browse billing cycles by uploaded spreadsheet files</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent4)', borderRadius: '8px', color: 'var(--accent4)' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--muted)' }}>
            <RefreshCw className="spinner" size={24} style={{ margin: '0 auto 12px' }} />
            <p>Loading files database...</p>
          </div>
        ) : fileCodes.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            <FileText size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
            <h3>No import ingestion files found</h3>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Go to "Import Excel" tab to upload your monthly SAP spreadsheet files.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
            {fileCodes.map((file) => (
              <div
                key={file.file_code}
                onClick={() => handleSelectFile(file.file_code)}
                className="widget-card"
                style={{ cursor: 'pointer', transition: 'var(--transition)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="widget-icon" style={{ background: 'rgba(245, 166, 35, 0.1)', color: 'var(--accent)' }}>
                    <FileText size={18} />
                  </div>
                  <span className="badge badge-secondary" style={{ fontSize: '10px' }}>{file.file_count} Files</span>
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text)', marginBottom: '2px' }}>
                    PMC {file.file_code}
                  </h3>
                  <p style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Zone Area Division Code
                  </p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
                  <span>Total Properties:</span>
                  <strong style={{ color: 'var(--text)' }}>{file.total_records?.toLocaleString()}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // LEVEL 2: Months under selected file code
  if (level === 'months') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={handleGoBack} className="btn btn-secondary" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="page-title">PMC {selectedFileCode} Monthly Runs</h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Select month card to view divisions</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--muted)' }}>
            <RefreshCw className="spinner" size={24} style={{ margin: '0 auto 12px' }} />
            <p>Loading monthly records...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
            {months.map((imp) => (
              <div
                key={imp.import_id}
                onClick={() => handleSelectMonth(imp)}
                className="widget-card"
                style={{ cursor: 'pointer', transition: 'var(--transition)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="widget-icon" style={{ background: 'rgba(79, 156, 249, 0.1)', color: 'var(--accent2)' }}>
                    <Calendar size={18} />
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>Active</span>
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text)', marginBottom: '2px' }}>
                    {imp.billing_month}
                  </h3>
                  <p style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Uploaded {new Date(imp.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
                  <span>Ingested Rows:</span>
                  <strong style={{ color: 'var(--text)' }}>{imp.total_rows?.toLocaleString()}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // LEVEL 3: Areas under selected monthly import
  if (level === 'areas') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={handleGoBack} className="btn btn-secondary" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="page-title">PMC {selectedFileCode} · {selectedImport?.billing_month} Areas</h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Select an area card to view meter network and assign tasks</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--muted)' }}>
            <RefreshCw className="spinner" size={24} style={{ margin: '0 auto 12px' }} />
            <p>Loading geographic areas...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
            {areas.map((area) => {
              const progress = area.total_properties > 0 ? (area.assigned_properties / area.total_properties) : 0;
              return (
                <div
                  key={area.id}
                  onClick={() => handleSelectArea(area)}
                  className="widget-card"
                  style={{ cursor: 'pointer', transition: 'var(--transition)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="widget-icon" style={{ background: 'rgba(79, 156, 249, 0.1)', color: 'var(--accent2)' }}>
                      <MapPin size={18} />
                    </div>
                    <span className="badge badge-secondary" style={{ fontSize: '10px' }}>Select Area</span>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text)', marginBottom: '2px' }}>{area.name}</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '12px' }}>{area.city}</p>
                  </div>

                  {/* Progress bar inside card */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                      <span>Assignments Coverage:</span>
                      <strong style={{ color: 'var(--text)' }}>{area.assigned_properties} / {area.total_properties}</strong>
                    </div>
                    <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--accent)', width: `${progress * 100}%` }}></div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Home size={11} />
                      <span>{area.flat_count} Fl.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Landmark size={11} />
                      <span>{area.bungalow_count} Bun.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Building2 size={11} />
                      <span>{area.raw_house_count} Raw.</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // LEVEL 4: Properties (seats) + Dual-Column Assignment Engine
  const filteredLeftProps = getFilteredLeftProperties();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', minHeight: 'calc(100vh - 120px)' }}>
      {/* Header and navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={handleGoBack} className="btn btn-secondary" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={22} style={{ color: 'var(--accent2)' }} /> {selectedArea?.name}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
              PMC {selectedFileCode} · {selectedImport?.billing_month} Run
            </p>
          </div>
        </div>

        {/* Quick stats legend */}
        <div style={{ display: 'flex', gap: '16px', background: 'var(--surface)', padding: '10px 18px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#e5e7eb', border: '1px solid var(--border)' }}></div>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Pending: <strong style={{ color: 'var(--text)' }}>{pendingCount}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}></div>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Done: <strong style={{ color: 'var(--text)' }}>{doneCount}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fef3c7', border: '1px solid #fde68a' }}></div>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Anomaly: <strong style={{ color: 'var(--text)' }}>{problemCount}</strong></span>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Total: <strong style={{ color: 'var(--text)' }}>{totalCount}</strong></span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent4)', borderRadius: '8px', color: 'var(--accent4)' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent3)', borderRadius: '8px', color: 'var(--accent3)' }}>
          <CheckCircle size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Filter panel */}
      <div className="filter-panel" style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 2, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search consumer, serial, meter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: '40px', fontSize: '13px' }}
          />
        </div>

        {/* Society dropdown */}
        <div style={{ flex: 1, minWidth: '160px' }}>
          <select className="form-input" value={selectedSociety} onChange={(e) => setSelectedSociety(e.target.value)} style={{ width: '100%', fontSize: '13px' }}>
            <option value="">All Societies / Streets</option>
            {societies.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Assigned Agent filter */}
        <div style={{ flex: 1, minWidth: '160px' }}>
          <select className="form-input" value={filterAgentId} onChange={(e) => setFilterAgentId(e.target.value)} style={{ width: '100%', fontSize: '13px' }}>
            <option value="">All Agent Allocations</option>
            <option value="unassigned">Unassigned Properties</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Reading Status filter */}
        <div style={{ flex: 0.8, minWidth: '120px' }}>
          <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%', fontSize: '13px' }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="done">Done</option>
            <option value="problem">Problem</option>
          </select>
        </div>

        {/* Property Type filter */}
        <div style={{ flex: 0.8, minWidth: '120px' }}>
          <select className="form-input" value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%', fontSize: '13px' }}>
            <option value="">All Types</option>
            <option value="flat">Flat</option>
            <option value="bungalow">Bungalow</option>
            <option value="raw_house">Raw House</option>
          </select>
        </div>
      </div>

      {/* Dual Column Layout container */}
      <div className="dual-column" style={{ display: 'flex', gap: '20px', flex: 1, alignItems: 'stretch' }}>
        
        {/* Column 1: Not Selected / Filtered properties */}
        <div style={{
          flex: 1.2,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent2)' }}>
                NOT SELECTED ({filteredLeftProps.length} visible)
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Press <kbd style={{ background: '#232a3d', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>Ctrl+A</kbd> to select all filtered results
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {leftCheckedIds.size > 0 && (
                <button 
                  onClick={() => setLeftCheckedIds(new Set())}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--accent4)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                >
                  Deselect All
                </button>
              )}
              <button 
                onClick={moveCheckedToRight}
                disabled={leftCheckedIds.size === 0}
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                Add Checked ({leftCheckedIds.size})
              </button>
              <button 
                onClick={moveAllFilteredToRight}
                disabled={filteredLeftProps.length === 0}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Add All Filtered ({filteredLeftProps.length})
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <RefreshCw className="spinner" size={20} style={{ margin: '0 auto 8px' }} />
              Loading properties list...
            </div>
          ) : filteredLeftProps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 10px', color: 'var(--muted)', fontSize: '13px' }}>
              No remaining properties match your active filter search parameters.
            </div>
          ) : (
            <div style={{ maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredLeftProps.map((seat) => {
                const isChecked = leftCheckedIds.has(seat.id);
                return (
                  <div 
                    key={seat.id}
                    onClick={() => toggleLeftRow(seat.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      background: isChecked ? 'rgba(245, 166, 35, 0.05)' : 'var(--card)',
                      border: '1px solid',
                      borderColor: isChecked ? 'var(--accent)' : 'var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                  >
                    <input 
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // toggled by parent div onClick
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)' }}>Sr. {seat.serial_no}</span>
                        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                          {seat.property_type === 'flat' ? '🏢 Flat' : seat.property_type === 'bungalow' ? '🏡 Bungalow' : '🏠 Raw House'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {seat.consumer_name}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {seat.address}
                      </p>
                      {seat.agent_name && (
                        <span style={{ display: 'inline-block', fontSize: '9px', background: 'rgba(79, 156, 249, 0.1)', color: 'var(--accent2)', padding: '1px 6px', borderRadius: '4px', marginTop: '4px' }}>
                          Assigned to: {seat.agent_name}
                        </span>
                      )}
                    </div>
                    {/* View details */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchPropertyDetail(seat.id);
                      }}
                      className="btn btn-secondary" 
                      style={{ padding: '4px 8px', fontSize: '10px' }}
                    >
                      Inspect
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 2: Selected properties / Target Agent assignment */}
        <div style={{
          flex: 0.8,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent)' }}>
              SELECTED FOR ASSIGNMENT ({assignedColumnIds.length})
            </h3>
            {assignedColumnIds.length > 0 && (
              <button 
                onClick={clearRightColumn}
                style={{ background: 'none', border: 'none', color: 'var(--accent4)', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}
              >
                Clear All
              </button>
            )}
          </div>

          {assignedColumnIds.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>
              <CheckSquare size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
              <p style={{ fontSize: '13px' }}>No properties selected yet.</p>
              <p style={{ fontSize: '11px', marginTop: '4px', maxWidth: '200px' }}>
                Select rows from the left column and click "Add Checked" to queue them.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
              {/* Selected List */}
              <div style={{ flex: 1, maxHeight: '35vh', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {assignedColumnIds.map((id) => {
                  const seat = seats.find(s => s.id === id);
                  if (!seat) return null;
                  return (
                    <div 
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text)' }}>Sr. {seat.serial_no}</span>
                        <p style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {seat.consumer_name}
                        </p>
                      </div>
                      <button 
                        onClick={() => removeRightProperty(id)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Assignment Submission Card */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    TARGET AGENT
                  </label>
                  <select 
                    className="form-input" 
                    value={targetAgentId} 
                    onChange={(e) => setTargetAgentId(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  >
                    <option value="">Select Target Agent...</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.phone})</option>)}
                  </select>
                </div>

                <button
                  onClick={handleAssignSubmit}
                  disabled={assigning || !targetAgentId || assignedColumnIds.length === 0}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  {assigning ? (
                    <>
                      <RefreshCw className="spinner" size={14} />
                      Saving assignments...
                    </>
                  ) : (
                    <>
                      <CheckSquare size={16} />
                      Assign Selected ({assignedColumnIds.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Slide-in Detail panel (same as previous) */}
        {selectedProperty && (
          <div style={{
            width: '320px',
            background: 'rgba(15, 23, 42, 0.98)',
            backdropFilter: 'blur(8px)',
            borderLeft: '1px solid var(--border)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '-10px 0 25px rgba(0,0,0,0.5)',
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 10,
            animation: 'slideIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <span className="badge badge-secondary" style={{ textTransform: 'uppercase', fontSize: '9px', letterSpacing: '1px' }}>
                {selectedProperty.property_type?.replace('_', ' ')} Inspect
              </span>
              <button
                onClick={() => setSelectedProperty(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {loadingPropertyDetail ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                <div>
                  <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Consumer Name</h4>
                  <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: '600' }}>{selectedProperty.consumer_name}</p>
                </div>

                <div>
                  <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Serial ID</h4>
                  <p style={{ color: 'var(--accent2)', fontSize: '13px', fontWeight: '700', fontFamily: 'monospace' }}>{selectedProperty.serial_no}</p>
                </div>

                <div>
                  <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Meter Serial No</h4>
                  <p style={{ color: 'var(--text)', fontSize: '13px', fontWeight: '500' }}>{selectedProperty.meter_no || 'N/A'}</p>
                </div>

                <div>
                  <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Street Address</h4>
                  <p style={{ color: 'var(--text)', fontSize: '12px', lineHeight: '1.4' }}>{selectedProperty.address}</p>
                </div>

                {selectedProperty.society && (
                  <div>
                    <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Society/Colony</h4>
                    <p style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: '600' }}>{selectedProperty.society}</p>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>Allocation</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text)' }}>
                    {selectedProperty.agent_name || 'Unassigned'}
                  </p>
                </div>

                {selectedProperty.reading_status && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>Reading Status</h4>
                    <span className={`badge ${selectedProperty.reading_status === 'reading_taken' ? 'badge-success' : 'badge-danger'}`} style={{ alignSelf: 'flex-start' }}>
                      {getStatusLabel(selectedProperty.reading_status)}
                    </span>
                    {selectedProperty.reading_value !== null && (
                      <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)' }}>
                        Value: {selectedProperty.reading_value} kWh
                      </p>
                    )}
                    {selectedProperty.photo_url && (
                      <a href={selectedProperty.photo_url} target="_blank" rel="noopener noreferrer">
                        <img 
                          src={selectedProperty.photo_url} 
                          alt="Proof" 
                          style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', marginTop: '4px' }} 
                        />
                      </a>
                    )}
                  </div>
                )}

                {/* Log Reading Form for Admins */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>✏️ Log / Edit Reading</h4>
                  
                  {/* Status Dropdown */}
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Status</label>
                    <select 
                      className="form-input" 
                      value={adminStatusCode} 
                      onChange={(e) => setAdminStatusCode(e.target.value)}
                      style={{ width: '100%', marginTop: '4px', fontSize: '12px', padding: '6px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px' }}
                    >
                      <option value="reading_taken">Reading Taken</option>
                      <option value="door_locked">Door Locked</option>
                      <option value="not_reachable">Not Reachable</option>
                      <option value="access_denied">Access Denied</option>
                      <option value="meter_not_found">Meter Not Found</option>
                      <option value="meter_damaged">Meter Damaged</option>
                      <option value="revisit_needed">Revisit Needed</option>
                      <option value="vacant_property">Vacant Property</option>
                    </select>
                  </div>

                  {/* Reading Value input */}
                  {adminStatusCode === 'reading_taken' && (
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Reading Value (kWh)</label>
                      <input 
                        type="number"
                        className="form-input"
                        placeholder="e.g. 142.50"
                        value={adminReadingValue}
                        onChange={(e) => setAdminReadingValue(e.target.value)}
                        style={{ width: '100%', marginTop: '4px', fontSize: '12px', padding: '6px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px' }}
                      />
                    </div>
                  )}

                  {/* Note input */}
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Note / Remark</label>
                    <textarea
                      className="form-input"
                      placeholder="Remarks or observation notes..."
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      rows={2}
                      style={{ width: '100%', marginTop: '4px', fontSize: '12px', padding: '6px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', resize: 'vertical' }}
                    />
                  </div>

                  {/* Photo upload input */}
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Photo Proof</label>
                    {adminPhotoUrl ? (
                      <div style={{ position: 'relative', marginTop: '4px' }}>
                        <img 
                          src={adminPhotoUrl} 
                          alt="Uploaded Proof" 
                          style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)' }} 
                        />
                        <button
                          onClick={() => setAdminPhotoUrl('')}
                          type="button"
                          style={{ position: 'absolute', right: '4px', top: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <input 
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        style={{ width: '100%', marginTop: '4px', fontSize: '11px', color: 'var(--muted)' }}
                      />
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSaveAdminReading}
                    disabled={submittingReading || (adminStatusCode === 'reading_taken' && !adminReadingValue)}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '8px', fontSize: '12px', marginTop: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                  >
                    {submittingReading ? 'Saving...' : 'Save Reading'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Areas;
