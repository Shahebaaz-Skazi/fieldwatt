import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Camera, CheckCircle2, AlertCircle, RefreshCw, Zap, MapPin, Hash, User } from 'lucide-react';

const applyWatermark = (imageFile, propertyDetails) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Scale font size based on image width for optimal legibility
      const fontSize = Math.max(20, Math.floor(canvas.width / 35));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = Math.max(2, Math.floor(fontSize / 8));

      const pad = Math.max(15, Math.floor(canvas.width / 50));
      const now = new Date().toLocaleString('en-IN');

      // Top left — consumer name
      ctx.textAlign = 'left';
      ctx.strokeText(propertyDetails.consumerName || '', pad, pad + fontSize);
      ctx.fillText(propertyDetails.consumerName || '', pad, pad + fontSize);

      // Top right — date time
      ctx.textAlign = 'right';
      ctx.strokeText(now, canvas.width - pad, pad + fontSize);
      ctx.fillText(now, canvas.width - pad, pad + fontSize);

      // Bottom left — meter number
      ctx.textAlign = 'left';
      const meterText = `Meter: ${propertyDetails.meterNo || 'N/A'}`;
      ctx.strokeText(meterText, pad, canvas.height - pad - (fontSize * 1.2));
      ctx.fillText(meterText, pad, canvas.height - pad - (fontSize * 1.2));

      // Bottom left second line — BP number
      const bpText = `BP: ${propertyDetails.bpNo || 'N/A'}`;
      ctx.strokeText(bpText, pad, canvas.height - pad);
      ctx.fillText(bpText, pad, canvas.height - pad);

      // Bottom right — FieldWatt
      ctx.textAlign = 'right';
      ctx.strokeText('FieldWatt', canvas.width - pad, canvas.height - pad);
      ctx.fillText('FieldWatt', canvas.width - pad, canvas.height - pad);

      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
    };
    img.src = URL.createObjectURL(imageFile);
  });
};

const SelfReading = () => {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyDetails, setPropertyDetails] = useState(null);

  const [readingValue, setReadingValue] = useState('');
  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  
  // Interactive styling focus helper states
  const [inputFocused, setInputFocused] = useState(false);
  const [uploadHovered, setUploadHovered] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('token');
    if (!tok) {
      setError('Missing authorization token. Please use the link provided in your WhatsApp message.');
      setLoading(false);
      return;
    }
    setToken(tok);

    const baseUrl = api.API_BASE_URL || '';
    fetch(`${baseUrl}/public/self-reading?token=${encodeURIComponent(tok)}`)
      .then(res => {
        if (!res.ok) throw new Error('This link has expired or is invalid. Please contact your provider.');
        return res.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPropertyDetails(data);
      })
      .catch(err => setError(err.message || 'This link has expired. Please contact your provider.'))
      .finally(() => setLoading(false));
  }, []);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProcessingPhoto(true);
    setSubmitError('');

    try {
      const watermarkedBlob = await applyWatermark(file, propertyDetails || {});
      setPhotoBlob(watermarkedBlob);
      const previewUrl = URL.createObjectURL(watermarkedBlob);
      setPhotoPreview(previewUrl);
    } catch (err) {
      console.error('Watermark error:', err);
      setSubmitError('Failed to process image. Please try selecting the photo again.');
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!readingValue || isNaN(parseFloat(readingValue))) {
      setSubmitError('Please enter a valid numeric meter reading.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      let photoBase64 = null;
      if (photoBlob) {
        photoBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(photoBlob);
        });
      }

      const baseUrl = api.API_BASE_URL || '';
      const response = await fetch(`${baseUrl}/public/self-reading/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          readingValue: parseFloat(readingValue).toString(),
          photoBase64,
          photoMimeType: 'image/jpeg'
        })
      });

      const resData = await response.json();
      if (!response.ok || resData.error) {
        throw new Error(resData.error || 'Submission failed. Please try again.');
      }

      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit reading. Please check your internet connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#080b12',
      color: '#f3f4f6',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      boxSizing: 'border-box'
    }}>
      {/* Header Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
        <div style={{ background: '#4f9cf9', padding: '8px', borderRadius: '10px', display: 'flex', boxShadow: '0 4px 12px rgba(79, 156, 249, 0.3)' }}>
          <Zap size={22} color="#ffffff" />
        </div>
        <span style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' }}>
          Field<span style={{ color: '#4f9cf9' }}>Watt</span>
        </span>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#1e2230',
        border: '1px solid #2a2f42',
        borderRadius: '20px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>
        {loading ? (
          <div style={{ padding: '64px 24px', textAlign: 'center', color: '#94a3b8' }}>
            <RefreshCw size={40} className="spinning" style={{ animation: 'spin 1.5s linear infinite', margin: '0 auto 20px', color: '#4f9cf9' }} />
            <p style={{ fontSize: '14px', fontWeight: '500' }}>Retrieving your property details...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '48px 28px', textAlign: 'center' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <AlertCircle size={44} style={{ color: '#ef4444' }} />
            </div>
            <h3 style={{ fontSize: '19px', fontWeight: '700', color: '#f87171', marginBottom: '12px' }}>Link Expired or Invalid</h3>
            <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: '1.6', margin: 0 }}>{error}</p>
          </div>
        ) : submitSuccess ? (
          <div style={{ padding: '56px 28px', textAlign: 'center' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <CheckCircle2 size={44} style={{ color: '#10b981' }} />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#ffffff', marginBottom: '12px' }}>Reading Submitted!</h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.6', margin: 0 }}>
              Thank you! Your meter reading and watermarked photo have been verified and successfully recorded.
            </p>
          </div>
        ) : (
          <div style={{ padding: '28px', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#ffffff', textAlign: 'center', marginBottom: '24px' }}>
              Meter Reading Submission
            </h2>

            {/* Consumer Details Card */}
            <div style={{
              backgroundColor: '#151922',
              borderRadius: '14px',
              padding: '20px',
              border: '1px solid #2a2f42',
              marginBottom: '28px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <User size={16} color="#4f9cf9" />
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>
                  {propertyDetails?.consumerName}
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', color: '#94a3b8', fontSize: '13px', lineHeight: '1.4', marginBottom: '16px' }}>
                <MapPin size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <span>{propertyDetails?.address}</span>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '12px', 
                fontSize: '12.5px', 
                borderTop: '1px solid #2a2f42', 
                paddingTop: '14px',
                color: '#94a3b8'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={13} style={{ color: '#4f9cf9' }} />
                  <span>Meter: <strong style={{ color: '#ffffff' }}>{propertyDetails?.meterNo}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={13} style={{ color: '#4f9cf9' }} />
                  <span>BP: <strong style={{ color: '#ffffff' }}>{propertyDetails?.bpNo}</strong></span>
                </div>
              </div>
            </div>

            {submitError && (
              <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', color: '#f87171', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: '600', color: '#d1d5db', marginBottom: '8px' }}>
                  Current Meter Reading
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Enter numerical value"
                  value={readingValue}
                  onChange={(e) => setReadingValue(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  required
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    backgroundColor: '#0f172a',
                    border: inputFocused ? '1px solid #4f9cf9' : '1px solid #334155',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '16px',
                    outline: 'none',
                    boxShadow: inputFocused ? '0 0 0 3px rgba(79, 156, 249, 0.25)' : 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease-in-out'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: '600', color: '#d1d5db', marginBottom: '8px' }}>
                  Meter Verification Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                  id="meter-photo-input"
                />
                
                <label 
                  htmlFor="meter-photo-input"
                  onMouseEnter={() => setUploadHovered(true)}
                  onMouseLeave={() => setUploadHovered(false)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '24px 16px',
                    backgroundColor: '#0f172a',
                    border: uploadHovered ? '2px dashed #4f9cf9' : '2px dashed #334155',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <div style={{ background: 'rgba(79, 156, 249, 0.1)', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={20} style={{ color: '#4f9cf9' }} />
                  </div>
                  <span>{photoPreview ? 'Change Selection' : 'Capture or Upload Photo'}</span>
                </label>

                {processingPhoto && (
                  <div style={{ fontSize: '12px', color: '#4f9cf9', marginTop: '8px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <RefreshCw size={12} className="spinning" style={{ animation: 'spin 1.5s linear infinite' }} />
                    <span>Overlaying watermark metadata...</span>
                  </div>
                )}

                {photoPreview && !processingPhoto && (
                  <div style={{ marginTop: '16px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #2a2f42', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)' }}>
                    <img src={photoPreview} alt="Watermarked Verification" style={{ width: '100%', display: 'block', maxHeight: '220px', objectFit: 'cover' }} />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || processingPhoto}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#4f9cf9',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting || processingPhoto ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(79, 156, 249, 0.25)',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease-in-out',
                  marginTop: '8px'
                }}
              >
                {submitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <RefreshCw size={16} className="spinning" style={{ animation: 'spin 1.5s linear infinite' }} />
                    <span>Submitting Reading...</span>
                  </span>
                ) : (
                  'Submit Operations Entry'
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spinning {
          animation: spin 1.5s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default SelfReading;
