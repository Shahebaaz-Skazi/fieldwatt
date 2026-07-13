import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { Search, MapPin, Users, Calendar, Filter, CheckSquare, Square, Check, RefreshCw } from 'lucide-react';

const Assignment = () => {
  const [properties, setProperties] = useState([]);
  const [agents, setAgents] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [societies, setSocieties] = useState([]);
  
  // Selection states
  const [selectedPropIds, setSelectedPropIds] = useState(new Set());
  const [selectedAgentId, setSelectedAgentId] = useState('');
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSocieties, setSelectedSocieties] = useState([]);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 100;

  // UI states
  const [showSocietyDropdown, setShowSocietyDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
      
      // Parallel fetches for speed
      const [cyclesData, societiesData, agentsData] = await Promise.all([
        api.get('/admin/assignments/cycles'),
        api.get('/admin/assignments/societies'),
        api.get('/admin/agents'),
      ]);
      
      setCycles(cyclesData);
      setSocieties(societiesData);
      setAgents(agentsData.filter(a => a.is_active));
      
      // Set default active cycle
      const activeCycle = cyclesData.find(c => c.is_active);
      if (activeCycle) {
        setSelectedCycleId(activeCycle.id);
      } else if (cyclesData.length > 0) {
        setSelectedCycleId(cyclesData[0].id);
      }
    } catch (err) {
      setMessage({ text: err.message || 'Failed to load filter metadata.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    if (!selectedCycleId) return;
    try {
      setLoading(true);
      const societiesQuery = selectedSocieties.join(',');
      const data = await api.get('/admin/assignments/search-properties', {
        params: {
          q: searchQuery,
          cycle_id: selectedCycleId,
          status: selectedStatus,
          societies: societiesQuery
        }
      });
      setProperties(data);
      
      // Auto-check properties if their society is in selectedSocieties
      const nextSelection = new Set();
      if (selectedSocieties.length > 0) {
        data.forEach(p => {
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
    fetchData();
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [searchQuery, selectedCycleId, selectedStatus, selectedSocieties]);

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
        cycle_id: selectedCycleId
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
        <div className="dual-column" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '16px' }}>
          
          {/* Search bar */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Search size={14} /> Search properties</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search Name, Serial, or Address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Billing Cycle */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> Billing Cycle</label>
            <select
              className="form-input"
              value={selectedCycleId}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              {cycles.map(c => (
                <option key={c.id} value={c.id}>{c.label} {c.is_active ? '(Active)' : ''}</option>
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
                  : selectedSocieties.join(', ').length > 25 
                    ? selectedSocieties.join(', ').slice(0, 22) + '...' 
                    : selectedSocieties.join(', ')}
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
                }} onClick={() => setShowSocietyDropdown(false)} />
                
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
                  maxHeight: '200px',
                  overflowY: 'auto',
                  padding: '8px',
                  marginTop: '4px'
                }}>
                  {societies.length === 0 ? (
                    <div style={{ color: 'var(--muted)', padding: '8px', fontSize: '12px' }}>No societies found</div>
                  ) : (
                    societies.map(soc => (
                      <label
                        key={soc}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: selectedSocieties.includes(soc) ? '#10b981' : 'var(--text)',
                          fontWeight: selectedSocieties.includes(soc) ? '600' : 'normal'
                        }}
                        className="hover-light"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSocieties.includes(soc)}
                          onChange={() => handleSocietyToggle(soc)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>{soc}</span>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Bulk assignment triggers */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border)',
          paddingTop: '16px',
          marginTop: '4px',
          flexWrap: 'wrap',
          gap: '16px'
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
        </div>
      )}
    </div>
  );
};

export default Assignment;
