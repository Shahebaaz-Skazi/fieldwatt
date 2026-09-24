import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../utils/api';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';

const GlobalSearch = ({ selectedCycleId, openReadingModal, setZoomPhoto }) => {
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [searchActive, setSearchActive] = useState(false);
  const [searching, setSearching] = useState(false);

  const handleGlobalSearch = async (e) => {
    if (e) e.preventDefault();
    if (!globalQuery || !globalQuery.trim()) return;

    setSearching(true);
    try {
      const results = await api.get('/admin/dashboard/global-search', {
        params: { q: globalQuery.trim(), cycle_id: selectedCycleId }
      });
      setGlobalResults(results);
      setSearchActive(true);
    } catch (err) {
      toast.error(err.message || 'Failed to execute global database search.');
    } finally {
      setSearching(false);
    }
  };

  const clearGlobalSearch = () => {
    setGlobalQuery('');
    setGlobalResults([]);
    setSearchActive(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Global Database Search</h3>
            <p style={{ color: 'var(--muted)', fontSize: '12px', margin: 0 }}>Search properties across all zones and history by BP No, Name, Meter, Mobile, Address, Area or Agent name</p>
          </div>

          <form onSubmit={handleGlobalSearch} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Enter name, BP no, meter no, mobile..."
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '48px', paddingRight: '16px', height: '48px', fontSize: '14px', borderRadius: '10px', boxSizing: 'border-box' }}
              />
            </div>
            <Button type="submit" style={{ height: '48px' }} disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </Button>
            {searchActive && (
              <Button type="button" variant="secondary" onClick={clearGlobalSearch} style={{ height: '48px' }}>
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {searchActive && (
        <Card style={{ animation: 'slideIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>
                Search Results ({globalResults.length})
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px', margin: 0 }}>Showing matching records found in the system</p>
            </div>
            <Button variant="secondary" onClick={clearGlobalSearch} style={{ padding: '6px 12px', fontSize: '12px' }}>
              Close Results
            </Button>
          </div>

          <div className="table-container" style={{ maxHeight: '450px', overflowY: 'auto' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Area / MRU</th>
                  <th>BP No. / Order No.</th>
                  <th>Consumer Details</th>
                  <th>Taken Image</th>
                  <th>Reading Value</th>
                  <th>Society & Address</th>
                  <th>Status</th>
                  <th>Assigned Agent</th>
                </tr>
              </thead>
              <tbody>
                {globalResults.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px' }}>
                      No properties found matching your query.
                    </td>
                  </tr>
                ) : (
                  globalResults.map((prop) => {
                    const mobile = prop.raw_sap_data?.['Mobile No.'] || prop.raw_sap_data?.['Telephone No.'] || 'N/A';
                    const bpNo = prop.raw_sap_data?.['BP No.'] || '-';
                    return (
                      <tr 
                        key={prop.id}
                        onClick={() => openReadingModal(prop)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span className="badge badge-pending" style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>
                            {prop.area_name}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: '700', color: 'var(--text)' }}>{prop.serial_no}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>BP: {bpNo}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', color: 'var(--text)' }}>{prop.consumer_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Mob: {mobile}</div>
                        </td>
                        <td>
                          {prop.photo_url ? (
                            <img 
                              src={prop.photo_url} 
                              alt="Meter Reading"
                              onClick={(e) => { e.stopPropagation(); setZoomPhoto(prop.photo_url); }}
                              style={{ 
                                width: '70px', 
                                height: '70px', 
                                borderRadius: '8px', 
                                objectFit: 'cover', 
                                cursor: 'zoom-in',
                                border: '1px solid var(--border)'
                              }} 
                              title="Click to zoom photo"
                            />
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>No Photo</span>
                          )}
                        </td>
                        <td style={{ fontWeight: '800', color: 'var(--text)', fontSize: '14px' }}>
                          {prop.reading_value !== null ? prop.reading_value : '-'}
                        </td>
                        <td>
                          <div style={{ fontWeight: '500', color: 'var(--text)', fontSize: '12px' }}>{prop.society || 'No Society'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={prop.address}>
                            {prop.address}
                          </div>
                        </td>
                        <td>
                          {prop.assignment_id ? (
                            prop.status_code ? (
                              <span className={`badge ${prop.status_code === 'reading_taken' ? 'badge-success' : 'badge-danger'}`}>
                                {prop.status_code.replace('_', ' ')}
                              </span>
                            ) : (
                              <span className="badge badge-pending">Assigned</span>
                            )
                          ) : (
                            <span className="badge badge-pending" style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td>
                          {prop.agent_name ? (
                            <div style={{ fontWeight: '500' }}>{prop.agent_name}</div>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default GlobalSearch;
