import React, { useState, useEffect } from 'react';
import { FileDown, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../utils/api';
import PaywallModal from '../PaywallModal';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';

const ViewerExportGrid = ({ viewerMode }) => {
  // Shared metadata
  const [mrus, setMrus] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);

  // MRU Data Exporter states
  const [selectedMru, setSelectedMru] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [exportMruLoading, setExportMruLoading] = useState(false);

  // Meter Image Downloader states
  const [imageMru, setImageMru] = useState('all');
  const [imageYear, setImageYear] = useState('');
  const [imageMonth, setImageMonth] = useState('');
  const [imageSociety, setImageSociety] = useState('');
  const [imageQuery, setImageQuery] = useState('');
  const [downloadImagesLoading, setDownloadImagesLoading] = useState(false);
  
  // Paywall Modal states
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [feeData, setFeeData] = useState(null);
  const [paywallPayload, setPaywallPayload] = useState({});
  const [paywallSuccessCallback, setPaywallSuccessCallback] = useState(() => () => {});

  useEffect(() => {
    if (viewerMode) {
      api.get('/admin/assignments/mrus')
        .then(data => setMrus(data))
        .catch(err => console.error('Failed to fetch MRUs:', err));
    }
  }, [viewerMode]);

  useEffect(() => {
    if (viewerMode && selectedMru) {
      api.get('/admin/assignments/months', { params: { mru: selectedMru } })
        .then(monthsData => {
          setAvailableMonths(monthsData);
          if (monthsData.length > 0) {
            setSelectedYear(monthsData[0].year.toString());
            setSelectedMonth(monthsData[0].month.toString());
          }
        })
        .catch(err => console.error('Failed to load months for selected MRU:', err));
    }
  }, [viewerMode, selectedMru]);

  useEffect(() => {
    if (viewerMode) {
      api.get('/admin/assignments/months', { params: { mru: imageMru || 'all' } })
        .then(monthsData => {
          if (monthsData.length > 0) {
            setImageYear(monthsData[0].year.toString());
            setImageMonth(monthsData[0].month.toString());
          }
        })
        .catch(err => console.error('Failed to load image months:', err));
    }
  }, [viewerMode, imageMru]);

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

  if (!viewerMode) return null;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Card 1: MRU Data Exporter */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
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

          <Button
            onClick={handleExport}
            disabled={exportMruLoading || !selectedMru || !selectedYear || !selectedMonth}
            style={{ width: '100%', marginTop: 'auto' }}
          >
            {exportMruLoading ? <RefreshCw size={16} className="spin" /> : <FileDown size={16} />}
            Export MRU Data to Excel (.xlsx)
          </Button>
        </Card>

        {/* Card 2: Meter Image Downloader */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FileDown size={18} style={{ color: 'var(--accent)' }} />
            Meter Image Bulk Downloader
          </h3>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '12px' }}>Filter by Area (MRU)</label>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Year</label>
              <select
                className="form-input"
                value={imageYear}
                onChange={(e) => setImageYear(e.target.value)}
                style={{ fontSize: '13px', cursor: 'pointer' }}
              >
                <option value="">-- Year --</option>
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
                <option value="">-- Month --</option>
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
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '12px' }}>Society Name (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Ganga Legends"
              value={imageSociety}
              onChange={(e) => setImageSociety(e.target.value)}
              style={{ fontSize: '13px' }}
            />
          </div>

          <Button
            onClick={handleDownloadImages}
            disabled={downloadImagesLoading || !imageYear || !imageMonth}
            style={{ width: '100%', marginTop: 'auto' }}
          >
            {downloadImagesLoading ? <RefreshCw size={16} className="spin" style={{ animation: 'spin 2s linear infinite' }} /> : <FileDown size={16} />}
            Download Images (.zip)
          </Button>
        </Card>
      </div>

      <PaywallModal 
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feeData={feeData}
        payload={paywallPayload}
        onSuccess={paywallSuccessCallback}
      />
    </>
  );
};

export default ViewerExportGrid;
