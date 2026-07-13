import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { Search, MapPin, Users, Calendar, Filter, CheckSquare, Square, Check, RefreshCw } from 'lucide-react';

const Assignment = () => {
  const [properties, setProperties] = useState([]);
  const [agents, setAgents] = useState([]);
  const [societies, setSocieties] = useState([]);
  
  // Filter and selection options list
  const [mrus, setMrus] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  
  // Selection states
  const [selectedPropIds, setSelectedPropIds] = useState(new Set());
  const [selectedAgentId, setSelectedAgentId] = useState(''); // Below-data agent filter to assign task
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMru, setSelectedMru] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSocieties, setSelectedSocieties] = useState([]);
  const [societySearch, setSocietySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [aboveAgentFilterId, setAboveAgentFilterId] = useState('all'); // Above data agent filter to view assigned data
  const [resolvedCycleId, setResolvedCycleId] = useState(null); // Resolved cycle ID for current search
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 100;

  // UI states
  const [showSocietyDropdown, setShowSocietyDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchMrusAndAgents = async () => {
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
      const [mrusData, agentsData] = await Promise.all([
        api.get('/admin/assignments/mrus'),
        api.get('/admin/agents'),
      ]);
      setMrus(mrusData);
      setAgents(agentsData.filter(a => a.is_active));
      
      if (mrusData.length > 0) {
        setSelectedMru(mrusData[0]);
      }
    } catch (err) {
      setMessage({ text: err.message || 'Failed to load filter metadata.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthsForMru = async (mru) => {
    if (!mru) {
      setAvailableMonths([]);
      setSelectedYear('');
      setSelectedMonth('');
      setSocieties([]);
      setSelectedSocieties([]);
      return;
    }
    try {
      const monthsData = await api.get('/admin/assignments/months', { params: { mru } });
      setAvailableMonths(monthsData);
      if (monthsData.length > 0) {
        setSelectedYear(monthsData[0].year.toString());
        setSelectedMonth(monthsData[0].month.toString());
      } else {
        setSelectedYear('');
        setSelectedMonth('');
      }
    } catch (err) {
      console.error('Failed to load months:', err);
    }
  };

  const fetchSocietiesForImport = async (mru, year, month) => {
    if (!mru || !year || !month) return;
    try {
      const societiesData = await api.get('/admin/assignments/societies', {
        params: { mru, year, month }
      });
      setSocieties(societiesData);
      setSelectedSocieties([]); // reset society selections
    } catch (err) {
      console.error('Failed to load societies:', err);
    }
  };

  const fetchProperties = async () => {
    if (!selectedMru || !selectedYear || !selectedMonth) {
      setMessage({ text: 'Please select Area (MRU), Year, and Month first.', type: 'error' });
      return;
    }
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
      const societiesQuery = selectedSocieties.join(',');
      const res = await api.get('/admin/assignments/search-properties', {
        params: {
          q: debouncedSearch,
          mru: selectedMru,
          year: selectedYear,
          month: selectedMonth,
          status: selectedStatus,
          societies: societiesQuery,
          agent_filter_id: aboveAgentFilterId
        }
      });
      const props = res.properties || [];
      setProperties(props);
      setResolvedCycleId(res.cycleId);

      // Auto-check properties if their society is in selectedSocieties
      const nextSelection = new Set();
      if (selectedSocieties.length > 0) {
        props.forEach(p => {
          if (selectedSocieties.includes(p.society)) {
            nextSelection.add(p.id);
          }
        });
      }
      setSelectedPropIds(nextSelection);
      setCurrentPage(1); // Reset pagination on data load
    } catch (err) {
      setMessage({ text: err.message || 'Failed to search properties.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMrusAndAgents();
  }, []);

  useEffect(() => {
    if (selectedMru) {
      fetchMonthsForMru(selectedMru);
    }
  }, [selectedMru]);

  useEffect(() => {
    if (selectedMru && selectedYear && selectedMonth) {
      fetchSocietiesForImport(selectedMru, selectedYear, selectedMonth);
    }
  }, [selectedMru, selectedYear, selectedMonth]);

  // Debounce search input — only fire backend query 400ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleShowData = () => {
    setHasLoaded(true);
    fetchProperties();
  };

  useEffect(() => {
    if (hasLoaded) {
      fetchProperties();
    }
  }, [debouncedSearch, selectedMru, selectedYear, selectedMonth, selectedSocieties, selectedStatus, aboveAgentFilterId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowSocietyDropdown(false);
        setSocietySearch('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedPropIds(new Set(properties.map(p => p.id)));
    } else {
      setSelectedPropIds(new Set());
    }
  };

  const handleSelectProperty = (id) => {
    const next = new Set(selectedPropIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedPropIds(next);
  };

  const handleSocietyToggle = (society) => {
    if (selectedSocieties.includes(society)) {
      setSelectedSocieties(selectedSocieties.filter(s => s !== society));
    } else {
      setSelectedSocieties([...selectedSocieties, society]);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedPropIds.size === 0) {
      setMessage({ text: 'Please select at least one property/flat to assign.', type: 'error' });
      return;
    }
    if (!selectedAgentId) {
      setMessage({ text: 'Please select an agent to assign the workload to.', type: 'error' });
      return;
    }

    try {
      setActionLoading(true);
      setMessage({ text: '', type: '' });
      
      const payload = {
        agent_id: selectedAgentId,
        property_ids: Array.from(selectedPropIds),
        cycle_id: resolvedCycleId
      };
      
      const res = await api.post('/admin/assignments/bulk', payload);
      setMessage({ text: `Successfully assigned ${res.count} properties.`, type: 'success' });
      setSelectedPropIds(new Set());
      fetchProperties();
    } catch (err) {
      setMessage({ text: err.message || 'Failed to complete bulk assignment.', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (prop) => {
    if (!prop.assignment_id) return <span className="badge badge-danger">Unassigned</span>;
    if (prop.status_code === 'completed') return <span className="badge badge-success">Completed ({prop.reading_value})</span>;
    if (prop.status_code === 'door_locked') return <span className="badge" style={{ backgroundColor: '#f59e0b', color: '#fff' }}>Door Locked</span>;
    return <span className="badge badge-success" style={{ backgroundColor: '#3b82f6', color: '#fff' }}>Assigned ({prop.agent_name})</span>;
  };

  // Slice paginated flats
  const totalPages = Math.ceil(properties.length / ITEMS_PER_PAGE) || 1;
  const paginatedProperties = properties.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Bulk Workload Assignment</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
            Filter properties by society, status, or search query and allocate them directly to agents.
          </p>
        </div>
      </div>

      {message.text && (
        <div style={{
          padding: '16px',
          background: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          color: message.type === 'error' ? 'var(--accent4)' : '#10b981',
          borderRadius: '8px',
          border: `1px solid ${message.type === 'error' ? 'var(--accent4)' : '#10b981'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage({ text: '', type: '' })} className="btn btn-secondary" style={{ padding: '2px 8px' }}>Dismiss</button>
        </div>
      )}

      {/* Bulk actions and filters header */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Row 1: Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          
          {/* Area (MRU) Dropdown */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Area (MRU)</label>
            <select
              className="form-input"
              value={selectedMru}
              onChange={(e) => setSelectedMru(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">-- Select MRU --</option>
              {mrus.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year Dropdown */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> Year</label>
            <select
              className="form-input"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">-- Select Year --</option>
              {Array.from(new Set(availableMonths.map(m => m.year))).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Month Dropdown */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> Month</label>
            <select
              className="form-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">-- Select Month --</option>
              {availableMonths
                .filter(m => m.year.toString() === selectedYear)
                .map(m => {
                  const date = new Date(2000, m.month - 1);
                  const monthName = date.toLocaleString('default', { month: 'long' });
                  return (
                    <option key={m.month} value={m.month}>{monthName}</option>
                  );
                })}
            </select>
          </div>

          {/* Society Dropdown Multi-Select */}
          <div className="form-group" style={{ margin: 0, position: 'relative' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Societies</label>
            <button
              type="button"
              className="form-input"
              onClick={() => setShowSocietyDropdown(!showSocietyDropdown)}
              style={{
                background: 'var(--bg-input)',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedSocieties.length === 0 
                  ? 'All Societies' 
                  : `${selectedSocieties.length} Selected (${selectedSocieties.slice(0, 2).join(', ')}${selectedSocieties.length > 2 ? '...' : ''})`}
              </span>
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>

            {showSocietyDropdown && (
              <>
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 9998
                }} onClick={() => { setShowSocietyDropdown(false); setSocietySearch(''); }} />
                
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                  zIndex: 9999,
                  maxHeight: '260px',
                  overflowY: 'auto',
                  padding: '8px',
                  marginTop: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {/* Inline Search Input */}
                  <input
                    type="text"
                    placeholder="Search society..."
                    value={societySearch}
                    onChange={(e) => setSocietySearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const matched = societies
                          .map(s => typeof s === 'string' ? { society: s, total_count: 0, assigned_count: 0 } : s)
                          .filter(s => s && s.society)
                          .filter(s => s.society.toLowerCase().includes(societySearch.toLowerCase()));
                        if (matched.length > 0) {
                          handleSocietyToggle(matched[0].society);
                          setSocietySearch('');
                        }
                      } else if (e.key === 'Escape') {
                        setShowSocietyDropdown(false);
                        setSocietySearch('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      marginBottom: '4px',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: 'var(--bg-input, #f3f4f6)',
                      color: 'var(--text, #111827)',
                      boxSizing: 'border-box'
                    }}
                    autoFocus
                  />

                  {(() => {
                    const normalized = societies
                      .map(s => typeof s === 'string' ? { society: s, total_count: 0, assigned_count: 0 } : s)
                      .filter(s => s && s.society);
                    const filtered = normalized.filter(s => s.society.toLowerCase().includes(societySearch.toLowerCase()));
                    const areAllSelected = filtered.length > 0 && filtered.every(s => selectedSocieties.includes(s.society));
                    
                    if (filtered.length === 0) {
                      return <div style={{ color: 'var(--muted)', padding: '8px', fontSize: '12px' }}>No societies match search query</div>;
                    }

                    return (
                      <>
                        {/* Select All Toggle */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderBottom: '1px solid var(--border)',
                            paddingBottom: '8px',
                            marginBottom: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={areAllSelected}
                            onChange={() => {
                              if (areAllSelected) {
                                setSelectedSocieties(selectedSocieties.filter(s => !filtered.map(x => x.society).includes(s)));
                              } else {
                                const union = Array.from(new Set([...selectedSocieties, ...filtered.map(x => x.society)]));
                                setSelectedSocieties(union);
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>Select All ({filtered.length})</span>
                        </label>

                        {/* List items with assignment count status colors */}
                        {filtered.map(soc => {
                          const isFullyAssigned = soc.total_count > 0 && soc.assigned_count === soc.total_count;
                          const isPartiallyAssigned = soc.assigned_count > 0 && soc.assigned_count < soc.total_count;
                          let statusColor = 'var(--text)';
                          if (isFullyAssigned) statusColor = '#10b981'; // Green
                          else if (isPartiallyAssigned) statusColor = '#f59e0b'; // Orange/Yellow
                          
                          return (
                            <label
                              key={soc.society}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: selectedSocieties.includes(soc.society) ? '#10b981' : statusColor,
                                fontWeight: selectedSocieties.includes(soc.society) || isFullyAssigned || isPartiallyAssigned ? '600' : 'normal'
                              }}
                              className="hover-light"
                            >
                              <input
                                type="checkbox"
                                checked={selectedSocieties.includes(soc.society)}
                                onChange={() => handleSocietyToggle(soc.society)}
                                style={{ cursor: 'pointer' }}
                              />
                              <span>
                                {soc.society}
                                <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>
                                  ({soc.assigned_count}/{soc.total_count})
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>

          {/* Above-Data Agent Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={14} /> Agent Filter</label>
            <select
              className="form-input"
              value={aboveAgentFilterId}
              onChange={(e) => setAboveAgentFilterId(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="all">All Agents</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Assignment Status */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Filter size={14} /> Assign Status</label>
            <select
              className="form-input"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="all">All Properties</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="doorlocked">Door Locked</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Show Data Button */}
          <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleShowData}
              style={{ width: '100%', height: '40px', justifyContent: 'center' }}
            >
              Show Data
            </button>
          </div>

        </div>

        {/* Row 2: Search Query Input (keeps direct keystroke/debounce filters working) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Search size={14} /> Search properties within loaded list</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search Name, Serial, or Address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Properties Table & Pagination Controls */}
      {loading ? (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '60px' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
          <span>Searching properties list...</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Scrollable fixed viewport container */}
          <div style={{ 
            maxHeight: '420px', 
            overflowY: 'auto', 
            border: '1px solid var(--border)', 
            borderRadius: '8px',
            backgroundColor: 'var(--surface)'
          }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={properties.length > 0 && selectedPropIds.size === properties.length}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Consumer Details</th>
                  <th>Serial / Meter No</th>
                  <th>Society</th>
                  <th>Area Location</th>
                  <th>Task Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProperties.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                      No properties match your filter options.
                    </td>
                  </tr>
                ) : (
                  paginatedProperties.map(prop => (
                    <tr
                      key={prop.id}
                      onClick={() => handleSelectProperty(prop.id)}
                      style={{ cursor: 'pointer', background: selectedPropIds.has(prop.id) ? 'rgba(59, 130, 246, 0.04)' : 'transparent' }}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedPropIds.has(prop.id)}
                          onChange={() => handleSelectProperty(prop.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--text)' }}>{prop.consumer_name}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>{prop.address}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '500' }}>{prop.serial_no}</div>
                        {prop.meter_no && <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>Meter: {prop.meter_no}</div>}
                      </td>
                      <td style={{ color: 'var(--text)' }}>{prop.society || '-'}</td>
                      <td>{prop.area_name || '-'}</td>
                      <td>{getStatusBadge(prop)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Client-Side Pagination Drawer controls */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              marginTop: '4px'
            }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Showing page <b>{currentPage}</b> of <b>{totalPages}</b> (Showing {paginatedProperties.length} of {properties.length.toLocaleString()} total flats)
              </span>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '13px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '13px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Below-data assignment triggers */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            marginTop: '16px'
          }}>
            <div style={{ color: 'var(--muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckSquare size={16} />
              Selected <strong style={{ color: 'var(--text)' }}>{selectedPropIds.size.toLocaleString()}</strong> of <strong style={{ color: 'var(--text)' }}>{properties.length.toLocaleString()}</strong> loaded properties.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>Assign to Agent:</span>
              <select
                className="form-input"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                style={{ width: '200px', cursor: 'pointer', height: '40px', padding: '0 12px' }}
              >
                <option value="">-- Choose Agent --</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              
              <button
                onClick={handleBulkAssign}
                disabled={actionLoading || selectedPropIds.size === 0 || !selectedAgentId}
                className="btn btn-primary"
                style={{ height: '40px', padding: '0 20px' }}
              >
                {actionLoading ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}
                Assign Workload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assignment;
