import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import anime from 'animejs';
import { FileDown, Award, TrendingUp, BarChart3, AlertCircle } from 'lucide-react';

const Reports = () => {
  const [data, setData] = useState({ agents: [] });
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // MRU wise export states
  const [mrus, setMrus] = useState([]);
  const [selectedMru, setSelectedMru] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [exportMruLoading, setExportMruLoading] = useState(false);

  // Meter image downloader states
  const [imageMru, setImageMru] = useState('all');
  const [imageYear, setImageYear] = useState('');
  const [imageMonth, setImageMonth] = useState('');
  const [imageSociety, setImageSociety] = useState('');
  const [imageQuery, setImageQuery] = useState('');
  const [downloadImagesLoading, setDownloadImagesLoading] = useState(false);

  const fetchReportsData = async () => {
    try {
      const [dbData, cyclesData, mrusData] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/assignments/coverage'), // using coverage as proxy for cycle listing
        api.get('/admin/assignments/mrus')
      ]);
      setData(dbData);
      setMrus(mrusData);
      // Mock cycle options since we don't have separate cycle CRUD page (standard YAGNI fallback)
      setCycles([
        { id: dbData.active_cycle_id, label: 'Active Billing Cycle' }
      ]);
      setSelectedCycleId(dbData.active_cycle_id);

      if (mrusData.length > 0) {
        setSelectedMru(mrusData[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to retrieve reports.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthsForMru = async (mru) => {
    if (!mru) return;
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
      console.error('Failed to load months for report:', err);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  useEffect(() => {
    if (selectedMru) {
      fetchMonthsForMru(selectedMru);
    }
  }, [selectedMru]);

  useEffect(() => {
    if (availableMonths.length > 0) {
      if (!imageYear) setImageYear(availableMonths[0].year.toString());
      if (!imageMonth) setImageMonth(availableMonths[0].month.toString());
    }
  }, [availableMonths]);

  // Anime.js entrance animations
  useEffect(() => {
    if (loading) return;

    anime({
      targets: '.animate-card',
      translateY: [20, 0],
      opacity: [0, 1],
      delay: anime.stagger(100),
      easing: 'easeOutQuad',
      duration: 600
    });

    anime({
      targets: '.animate-row',
      translateX: [-10, 0],
      opacity: [0, 1],
      delay: anime.stagger(50),
      easing: 'easeOutQuad',
      duration: 500
    });
  }, [loading]);

  const handleExportCSV = async () => {
    if (!selectedCycleId) return;

    try {
      // Fetch all readings for all agents in this cycle to format
      const exportRows = [];
      // Headers
      exportRows.push(['Serial No', 'Consumer Name', 'Address', 'Meter No', 'Property Type', 'Agent Name', 'Status', 'Reading Value (kWh)', 'Submitted At']);

      for (const agent of data.agents) {
        const readings = await api.get(`/admin/dashboard/agents/${agent.id}/readings?cycle_id=${selectedCycleId}`);
        readings.forEach(r => {
          exportRows.push([
            r.serial_no,
            r.consumer_name,
            `"${r.address.replace(/"/g, '""')}"`, // escape quotes for CSV
            r.meter_no || 'N/A',
            r.property_type,
            agent.name,
            r.status_code,
            r.reading_value !== null ? r.reading_value : '-',
            new Date(r.submitted_at).toLocaleString()
          ]);
        });
      }

      if (exportRows.length === 1) {
        alert('No readings recorded in this cycle to export.');
        return;
      }

      // Compile CSV String
      const csvContent = '\uFEFF' + exportRows.map(e => e.join(',')).join('\n'); // added BOM for Excel compatibility
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `FieldWatt_Readings_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('CSV compile failed: ' + err.message);
    }
  };

  const handleExportMruCSV = async () => {
    if (!selectedMru || !selectedYear || !selectedMonth) {
      alert('Please select MRU, Year, and Month first.');
      return;
    }

    try {
      setExportMruLoading(true);
      const res = await api.get('/admin/assignments/export', {
        params: {
          mru: selectedMru,
          year: selectedYear,
          month: selectedMonth
        }
      });

      if (!res || res.length === 0) {
        alert('No data found for this selection to export.');
        return;
      }

      const headers = [
        'MR ORDER ID',
        'MRU NAME',
        'BP No.',
        'Installation No.',
        'BPNAME',
        'Regional structure g',
        'Device Serial No.',
        'c/o name',
        'Building (Number or Code)',
        'House number supplement',
        'House Number',
        'Floor in building',
        'Street 2',
        'Street 3',
        'Street',
        'Location',
        'Area',
        'city',
        'City postal code',
        'Register',
        'Scheduled meter reading date',
        'Current meter reading date',
        'Current MR',
        'MR Note',
        'Comment',
        'Excl. SD Amount',
        'SD Amount',
        'Total Amount',
        'Telephone No.',
        'Mobile No.'
      ];

      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = val.toString();
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const exportRows = [];
      // Headers Row
      exportRows.push(headers);

      res.forEach(r => {
        // Start with raw sap data if saved, or build fallback mapping
        const rowObj = r.raw_sap_data ? { ...r.raw_sap_data } : {
          'MR ORDER ID': r.serial_no,
          'MRU NAME': selectedMru === 'all' ? r.area_name || '' : selectedMru,
          'BPNAME': r.consumer_name,
          'Device Serial No.': r.meter_no || '',
          'Street': r.society || '',
          'city': 'PUNE',
          'House number supplement': r.property_type === 'flat' ? 'FLAT' : 'PLOT'
        };

        // Format reading dates as DD.MM.YYYY
        let readingDate = '';
        if (r.submitted_at) {
          const d = new Date(r.submitted_at);
          const day = String(d.getDate()).padStart(2, '0');
          const monthStr = String(d.getMonth() + 1).padStart(2, '0');
          const yearStr = d.getFullYear();
          readingDate = `${day}.${monthStr}.${yearStr}`;
        }
        rowObj['Current meter reading date'] = readingDate;

        // Current MR (value)
        rowObj['Current MR'] = r.reading_value !== null && r.reading_value !== undefined ? r.reading_value : '';

        // MR Note status mapping
        let mrNote = '';
        if (r.status && r.status !== 'pending') {
          if (r.status === 'reading_taken') mrNote = '';
          else if (r.status === 'door_locked') mrNote = 'Door Locked';
          else if (r.status === 'not_reachable') mrNote = 'Not Reachable';
          else mrNote = r.status.replace(/_/g, ' ').toUpperCase();
        }
        rowObj['MR Note'] = mrNote;

        // Comment
        rowObj['Comment'] = r.reading_note || '';

        // Map to standard columns order
        const csvRow = headers.map(h => escapeCsv(rowObj[h]));
        exportRows.push(csvRow);
      });

      // Compile CSV String
      const csvContent = '\uFEFF' + exportRows.map(e => e.join(',')).join('\n'); // added BOM for Excel compatibility
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const dateName = new Date(2000, parseInt(selectedMonth) - 1).toLocaleString('default', { month: 'short' });
      link.setAttribute('download', `FieldWatt_${selectedMru}_${dateName}_${selectedYear}_Export.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('CSV export failed: ' + err.message);
    } finally {
      setExportMruLoading(false);
    }
  };

  const handleDownloadImages = async () => {
    if (!imageYear || !imageMonth) {
      alert('Please select Year and Month first.');
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

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `FieldWatt_Images_${imageMru}_${imageMonth}_${imageYear}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Download failed: ' + err.message);
    } finally {
      setDownloadImagesLoading(false);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>Analyzing reports metrics...</div>;
  }

  // Calculate efficiency score card rankings
  const rankedAgents = data.agents
    .map(agent => {
      const completionRate = agent.assigned_count > 0 
        ? Math.round((agent.done_count / agent.assigned_count) * 100) 
        : 0;
      
      // Accuracy score: completed readings with no anomalies
      const anomalyRate = agent.done_count > 0
        ? Math.round((agent.problem_count / agent.assigned_count) * 100)
        : 0;
      const accuracyScore = Math.max(100 - anomalyRate, 0);

      // Total efficiency: completion weighted by accuracy
      const efficiencyScore = Math.round((completionRate * 0.7) + (accuracyScore * 0.3));

      return {
        ...agent,
        completionRate,
        accuracyScore,
        efficiencyScore
      };
    })
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics & Reports</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Export cycle logs and audit agent performance parameters</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent4)', borderRadius: '8px', border: '1px solid var(--accent4)' }}>
          {error}
        </div>
      )}

      <div className="reports-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px', alignItems: 'start' }}>
        {/* Efficiency scoreboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text)' }}>Agent Performance Leaderboard</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Agent Name</th>
                  <th>Completion Rate</th>
                  <th>Accuracy Index</th>
                  <th>Efficiency Score</th>
                  <th style={{ textAlign: 'right' }}>Award</th>
                </tr>
              </thead>
              <tbody>
                {rankedAgents.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No performance data collected.</td>
                  </tr>
                ) : (
                  rankedAgents.map((agent, index) => (
                    <tr key={agent.id} className="animate-row" style={{ opacity: 0 }}>
                      <td style={{ fontWeight: '700', color: index === 0 ? 'var(--accent)' : 'var(--muted)' }}>#{index + 1}</td>
                      <td style={{ fontWeight: '600', color: 'var(--text)' }}>{agent.name}</td>
                      <td>{agent.completionRate}%</td>
                      <td>{agent.accuracyScore}%</td>
                      <td style={{ fontWeight: '700', color: 'var(--accent2)' }}>{agent.efficiencyScore} pts</td>
                      <td style={{ textAlign: 'right' }}>
                        {index === 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontWeight: '600', fontSize: '12px' }}>
                            <Award size={14} /> Elite Rank
                          </span>
                        ) : index < 3 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', fontSize: '12px' }}>
                            Superstars
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Export Panel Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="animate-card" style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            opacity: 0
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileDown size={18} style={{ color: 'var(--accent)' }} />
              Data Exporter
            </h3>
            
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>Target billing cycle</label>
              <select
                className="form-input"
                value={selectedCycleId}
                onChange={(e) => setSelectedCycleId(e.target.value)}
                style={{ fontSize: '13px' }}
              >
                {cycles.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <button onClick={handleExportCSV} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              <FileDown size={16} />
              Export Cycle Data to CSV
            </button>
          </div>

          {/* MRU-wise Data Exporter */}
          <div className="animate-card" style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            opacity: 0
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileDown size={18} style={{ color: 'var(--accent2)' }} />
              MRU Data Exporter
            </h3>
            
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Area (MRU)</label>
              <select
                className="form-input"
                value={selectedMru}
                onChange={(e) => setSelectedMru(e.target.value)}
                style={{ fontSize: '13px', cursor: 'pointer' }}
              >
                <option value="">-- Select MRU --</option>
                <option value="all">-- All Areas --</option>
                {mrus.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Year</label>
              <select
                className="form-input"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                style={{ fontSize: '13px', cursor: 'pointer' }}
              >
                <option value="">-- Select Year --</option>
                {Array.from(new Set(availableMonths.map(m => m.year))).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Month</label>
              <select
                className="form-input"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ fontSize: '13px', cursor: 'pointer' }}
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

            <button
              onClick={handleExportMruCSV}
              disabled={exportMruLoading || !selectedMru || !selectedYear || !selectedMonth}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', gap: '8px' }}
            >
              {exportMruLoading ? <RefreshCw size={16} className="spin" /> : <FileDown size={16} />}
              Export MRU Data to CSV
            </button>
          </div>

          {/* Meter Image Downloader Card */}
          <div className="animate-card" style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            opacity: 0
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileDown size={18} style={{ color: 'var(--accent3)' }} />
              Meter Image Downloader
            </h3>
            
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Area (MRU)</label>
              <select
                className="form-input"
                value={imageMru}
                onChange={(e) => setImageMru(e.target.value)}
                style={{ fontSize: '13px', cursor: 'pointer' }}
              >
                <option value="all">-- All Areas --</option>
                {mrus.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Year</label>
              <select
                className="form-input"
                value={imageYear}
                onChange={(e) => setImageYear(e.target.value)}
                style={{ fontSize: '13px', cursor: 'pointer' }}
              >
                <option value="">-- Select Year --</option>
                {Array.from(new Set(availableMonths.map(m => m.year))).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Month</label>
              <select
                className="form-input"
                value={imageMonth}
                onChange={(e) => setImageMonth(e.target.value)}
                style={{ fontSize: '13px', cursor: 'pointer' }}
              >
                <option value="">-- Select Month --</option>
                {availableMonths
                  .filter(m => m.year.toString() === imageYear)
                  .map(m => {
                    const date = new Date(2000, m.month - 1);
                    const monthName = date.toLocaleString('default', { month: 'long' });
                    return (
                      <option key={m.month} value={m.month}>{monthName}</option>
                    );
                  })}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Society Name (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Krishna Nayan"
                value={imageSociety}
                onChange={(e) => setImageSociety(e.target.value)}
                style={{ fontSize: '13px' }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Flat / BP / Name Search (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 50319006"
                value={imageQuery}
                onChange={(e) => setImageQuery(e.target.value)}
                style={{ fontSize: '13px' }}
              />
            </div>

            <button
              onClick={handleDownloadImages}
              disabled={downloadImagesLoading || !imageYear || !imageMonth}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', gap: '8px', background: 'var(--accent3)', borderColor: 'var(--accent3)' }}
            >
              {downloadImagesLoading ? <RefreshCw size={16} className="spin" style={{ animation: 'spin 2s linear infinite' }} /> : <FileDown size={16} />}
              Download Images (ZIP)
            </button>
          </div>

          <div className="animate-card" style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            opacity: 0
          }}>
            <h4 style={{ color: 'var(--text)', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={14} style={{ color: 'var(--accent3)' }} />
              Operational Insights
            </h4>
            <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: '1.5' }}>
              Agent Efficiency scores are calculated using a 70% weight on completed assigned workloads, combined with a 30% accuracy audit (evaluating anomalous readings and proximity warnings).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
