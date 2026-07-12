import React, { useState, useRef, useEffect } from 'react';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { UploadCloud, FileSpreadsheet, Play, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const Import = () => {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Import job tracking states
  const [jobId, setJobId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    setError('');
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const handleFileSelect = (e) => {
    setError('');
    const selectedFile = e.target.files[0];
    validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setError('Only Excel spreadsheet files (.xlsx, .xls) are supported.');
      return;
    }
    setFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');
    setSuccess('');
    setProgress(0);
    setTotalRows(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/admin/import', formData);
      setJobId(response.jobId);
      setSuccess('Spreadsheet uploaded. Starting parsing pipeline...');
    } catch (err) {
      setError(err.message || 'Excel ingestion failed.');
      setLoading(false);
    }
  };

  // Listen to background progress via Server-Sent Events (SSE)
  useEffect(() => {
    if (!jobId) return;

    const token = localStorage.getItem('admin_token');
    const sseUrl = `${api.API_BASE_URL}/admin/import/${jobId}/status?token=${token}`;
    
    // Custom handling for SSE with auth can be simplified by passing token in query
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setImportStatus(data.status);
        
        if (data.total) setTotalRows(data.total);
        if (data.progress) setProgress(data.progress);

        if (data.status === 'completed') {
          setSuccess('Property ingestion completed successfully! Redirecting to Areas Browser...');
          eventSource.close();
          setJobId(null);
          setLoading(false);
          setFile(null);
          setTimeout(() => {
            useAuthStore.getState().setActivePage('areas');
          }, 1500);
        } else if (data.status === 'failed') {
          setError(data.error || 'Excel parsing failed.');
          eventSource.close();
          setJobId(null);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
      }
    };

    eventSource.onerror = (err) => {
      // Clean fallback if connection closes or SSE fails
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Excel Properties Ingestion</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Upload a spreadsheet to import properties, consumer keys, and meter registers</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent4)', borderRadius: '8px', border: '1px solid var(--accent4)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent3)', borderRadius: '8px', border: '1px solid var(--accent3)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      <div style={{
        maxWidth: '600px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {!loading ? (
          <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div
              className={`drag-drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept=".xlsx, .xls"
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <UploadCloud size={48} style={{ color: file ? 'var(--accent)' : 'var(--muted)', transition: 'var(--transition)' }} />
                {file ? (
                  <div>
                    <p style={{ fontWeight: '600', color: 'var(--text)' }}>{file.name}</p>
                    <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>{(file.size / 1024).toFixed(1)} KB · Click to change file</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: '600', color: 'var(--text)' }}>Drag & drop your Excel file here</p>
                    <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>Supports standard .xlsx or .xls spreadsheets</p>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" disabled={!file} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              <Play size={16} />
              Start Ingestion Process
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', padding: '24px 0' }}>
            <RefreshCw size={36} className="spinning" style={{ color: 'var(--accent)', animation: 'spin 2s linear infinite' }} />
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: '600' }}>Processing Spreadsheet</h3>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>Worker thread mapping headers and performing batch insertion...</p>
            </div>
            
            {/* Progress Bar */}
            {totalRows > 0 && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--muted)' }}>Ingestion progress</span>
                  <span style={{ fontWeight: '600', color: 'var(--text)' }}>{Math.round((progress / totalRows) * 100)}% ({progress} / {totalRows})</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(progress / totalRows) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px', transition: 'width 0.2s ease-out' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Import;
