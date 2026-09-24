import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import api from '../../utils/api';
import { applyAdminWatermark } from '../../utils/watermark';

const PropertyReadingModal = ({ viewingReading, setViewingReading, setZoomPhoto }) => {
  const [editReadingValue, setEditReadingValue] = useState('');
  const [editStatusCode, setEditStatusCode] = useState('');
  const [editNote, setEditNote] = useState('');
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [saveModalLoading, setSaveModalLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (viewingReading) {
      setEditReadingValue(viewingReading.reading_value !== null && viewingReading.reading_value !== undefined ? viewingReading.reading_value.toString() : '');
      setEditStatusCode(viewingReading.status_code || 'reading_taken');
      setEditNote(viewingReading.note || '');
      setSelectedPhotoFile(null);
      setPhotoPreviewUrl(viewingReading.photo_url || null);
      setEditingPhoto(false);
    }
  }, [viewingReading]);

  if (!viewingReading) return null;

  const closeReadingModal = () => {
    setViewingReading(null);
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedPhotoFile(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSavePropertyDetails = async () => {
    if (!viewingReading) return;
    const propId = viewingReading.property_id || viewingReading.id;
    if (!propId) {
      toast.error('Property ID not found.');
      return;
    }

    try {
      setSaveModalLoading(true);
      let finalPhotoUrl = viewingReading.photo_url || null;

      if (selectedPhotoFile) {
        const watermarkedBlob = await applyAdminWatermark(selectedPhotoFile, {
          consumerName: viewingReading.consumer_name || '',
          meterNo: viewingReading.meter_no || '',
          bpNo: viewingReading.raw_sap_data?.['BP No.'] || '',
        });

        const { uploadUrl, photoUrl } = await api.post('/agent/upload-url', {
          filename: `admin_manual_${Date.now()}.jpg`,
          contentType: 'image/jpeg',
        });

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: watermarkedBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        });

        if (!uploadRes.ok) throw new Error('Photo upload failed');
        finalPhotoUrl = photoUrl;
      }

      await api.post(`/admin/areas/property/${propId}/reading`, {
        status_code: editStatusCode,
        reading_value: editReadingValue !== '' ? parseFloat(editReadingValue) : null,
        note: editNote || null,
        photo_url: finalPhotoUrl,
      });

      setViewingReading(prev => ({
        ...prev,
        reading_value: editReadingValue !== '' ? parseFloat(editReadingValue) : null,
        status_code: editStatusCode,
        note: editNote,
        photo_url: finalPhotoUrl,
        task_status: 'COMPLETED'
      }));

      toast.success('Property details saved successfully!');
      closeReadingModal();
    } catch (err) {
      toast.error('Failed to save property reading: ' + (err.message || 'Unknown error'));
    } finally {
      setSaveModalLoading(false);
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={closeReadingModal}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '600px', 
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>Reading Details</h2>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>BP No. {viewingReading.bp_no || viewingReading.serial_no}</p>
          </div>
          <Button variant="secondary" onClick={closeReadingModal} style={{ padding: '4px', cursor: 'pointer' }}>
            <X size={16} />
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '600' }}>Consumer Name</span>
              <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{viewingReading.consumer_name}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '600' }}>Meter No</span>
              <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}><code>{viewingReading.meter_no}</code></span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '600' }}>Address</span>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>{viewingReading.address}</span>
            </div>
            
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Status Code</label>
              <select 
                className="form-input" 
                value={editStatusCode} 
                onChange={(e) => setEditStatusCode(e.target.value)}
              >
                <option value="reading_taken">Reading Taken</option>
                <option value="door_locked">Door Locked</option>
                <option value="meter_faulty">Meter Faulty</option>
                <option value="meter_missing">Meter Missing</option>
                <option value="consumer_refused">Consumer Refused</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Reading Value</label>
              <input 
                type="number" 
                className="form-input" 
                value={editReadingValue} 
                onChange={(e) => setEditReadingValue(e.target.value)} 
                placeholder="Enter reading"
                style={{ fontSize: '16px', fontWeight: '600' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ fontSize: '12px', margin: 0 }}>Meter Image</label>
                {photoPreviewUrl && !editingPhoto && (
                  <button 
                    type="button" 
                    onClick={() => setEditingPhoto(true)}
                    style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Replace Image
                  </button>
                )}
              </div>
              
              {photoPreviewUrl && !editingPhoto ? (
                <div style={{ position: 'relative', width: '100%', height: '160px', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img 
                    src={photoPreviewUrl} 
                    alt="Meter preview" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} 
                    onClick={() => setZoomPhoto(photoPreviewUrl)}
                  />
                  <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'none' }}>
                    <ZoomIn size={12} /> Click to zoom
                  </div>
                </div>
              ) : (
                <div 
                  style={{ 
                    width: '100%', 
                    height: '160px', 
                    border: '2px dashed var(--border)', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    gap: '8px',
                    background: '#fafafa',
                    cursor: 'pointer'
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={24} style={{ color: 'var(--muted)' }} />
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Click to upload new image</span>
                  {selectedPhotoFile && <span style={{ fontSize: '11px', color: 'var(--accent3)' }}>File selected</span>}
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    onChange={handlePhotoSelect} 
                    style={{ display: 'none' }} 
                  />
                </div>
              )}
            </div>

            <div className="form-group" style={{ margin: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Admin Note</label>
              <textarea 
                className="form-input" 
                value={editNote} 
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Add optional context..."
                style={{ flex: 1, resize: 'none', minHeight: '80px', fontSize: '13px' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" onClick={closeReadingModal}>
            Cancel
          </Button>
          <Button 
            onClick={handleSavePropertyDetails} 
            disabled={saveModalLoading} 
          >
            {saveModalLoading ? 'Saving...' : 'Save & Complete Property'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PropertyReadingModal;
