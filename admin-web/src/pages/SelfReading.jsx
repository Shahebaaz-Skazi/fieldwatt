import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Camera, CheckCircle2, AlertCircle, RefreshCw, Zap } from 'lucide-react';

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
      backgroundColor: '#0b0f19',
      color: '#f3f4f6',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px'
    }}>
      {/* Header Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <div style={{ background: '#3b82f6', padding: '6px', borderRadius: '8px', display: 'flex' }}>
          <Zap size={22} color="#ffffff" />
        </div>
        <span style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px' }}>
          Field<span style={{ color: '#3b82f6' }}>Watt</span>
        </span>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
            <RefreshCw size={36} className="spinning" style={{ animation: 'spin 1.5s linear infinite', margin: '0 auto 16px', color: '#3b82f6' }} />
            <p style={{ fontSize: '14px' }}>Loading property details...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#ef4444' }}>
            <AlertCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.9 }} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#f87171', marginBottom: '8px' }}>Link Expired or Invalid</h3>
            <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' }}>{error}</p>
          </div>
        ) : submitSuccess ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <CheckCircle2 size={56} style={{ color: '#10b981', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#ffffff', marginBottom: '8px' }}>Reading Submitted!</h2>
            <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.6' }}>
              Thank you! Your meter reading has been verified and recorded successfully.
            </p>
          </div>
        ) : (
          <div style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff', textAlign: 'center', marginBottom: '20px' }}>
              Meter Reading Submission
            </h2>

            {/* Property Info Card */}
            <div style={{
              backgroundColor: '#1f2937',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #374151',
              marginBottom: '24px'
            }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#60a5fa', marginBottom: '6px' }}>
                {propertyDetails?.consumerName}
              </div>
              <div style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '12px', lineHeight: '1.4' }}>
                {propertyDetails?.address}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', borderTop: '1px solid #374151', paddingTop: '10px' }}>
                <div>
                  <span style={{ color: '#9ca3af' }}>Meter No: </span>
                  <strong style={{ color: '#ffffff' }}>{propertyDetails?.meterNo}</strong>
                </div>
                <div>
                  <span style={{ color: '#9ca3af' }}>BP No: </span>
                  <strong style={{ color: '#ffffff' }}>{propertyDetails?.bpNo}</strong>
                </div>
              </div>
            </div>

            {submitError && (
              <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#f87171', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#d1d5db', marginBottom: '8px' }}>
                  Enter your current meter reading:
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 1245.5"
                  value={readingValue}
                  onChange={(e) => setReadingValue(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '16px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#d1d5db', marginBottom: '8px' }}>
                  Upload meter photo:
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                  id="meter-photo-input"
                />
                <label htmlFor="meter-photo-input" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '14px',
                  backgroundColor: '#1f2937',
                  border: '1px dashed #4b5563',
                  borderRadius: '8px',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background 0.2s'
                }}>
                  <Camera size={18} style={{ color: '#60a5fa' }} />
                  <span>{photoPreview ? 'Change Photo' : 'Take / Choose Photo'}</span>
                </label>

                {processingPhoto && (
                  <div style={{ fontSize: '12px', color: '#60a5fa', marginTop: '6px', textAlign: 'center' }}>
                    Watermarking photo...
                  </div>
                )}

                {photoPreview && !processingPhoto && (
                  <div style={{ marginTop: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #374151' }}>
                    <img src={photoPreview} alt="Watermarked Preview" style={{ width: '100%', display: 'block', maxHeight: '240px', objectFit: 'cover' }} />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || processingPhoto}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  transition: 'background 0.2s',
                  marginTop: '8px'
                }}
              >
                {submitting ? 'Submitting Reading...' : 'Submit Reading'}
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
      `}</style>
    </div>
  );
};

export default SelfReading;
