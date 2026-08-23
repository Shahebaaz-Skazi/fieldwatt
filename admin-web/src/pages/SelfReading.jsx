import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Camera, CheckCircle2, AlertCircle, RefreshCw, Zap, MapPin, Hash, User } from 'lucide-react';

const applyWatermark = (imageFile, propertyDetails, gpsString) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Scale styling dynamically based on canvas.width
        const fontSize = Math.max(16, Math.floor(canvas.width * 0.024));
        const margin = Math.max(15, Math.floor(canvas.width * 0.022));
        const xPad = fontSize * 0.45;
        const yPad = fontSize * 0.35;
        const boxHeight = fontSize + yPad * 2;

        const now = new Date().toLocaleString('en-IN');

        // Helper to draw a semi-transparent black rectangular box in the corners
        const drawCornerBox = (text, isLeft, isTop) => {
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textWidth = ctx.measureText(text).width;
          const boxWidth = textWidth + xPad * 2;

          const boxX = isLeft ? margin : (canvas.width - margin - boxWidth);
          const boxY = isTop ? margin : (canvas.height - margin - boxHeight);

          // Draw banner background box
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

          // Burn in white text aligned middle
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, boxX + xPad, boxY + boxHeight / 2);
        };

        // Render metadata into the four corners
        drawCornerBox(propertyDetails.consumerName || 'N/A', true, true); // Top-Left
        drawCornerBox(now, false, true); // Top-Right
        drawCornerBox(`Meter: ${propertyDetails.meterNo || 'N/A'}`, true, false); // Bottom-Left
        drawCornerBox(`BP: ${propertyDetails.bpNo || 'N/A'}`, false, false); // Bottom-Right

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(imageFile);
  });
};

const SelfReading = () => {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyDetails, setPropertyDetails] = useState(null);

  const [readingValue, setReadingValue] = useState('');
  const [photoBlob, setPhotoBlob] = useState(null); // stores the base64 watermarked URL
  const [photoPreview, setPhotoPreview] = useState(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  
  // Interactive styling focus helper states
  const [inputFocused, setInputFocused] = useState(false);
  const [uploadHovered, setUploadHovered] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

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
      // Fetch GPS location with a 5-second timeout and high accuracy
      const gpsString = await new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve('GPS: Not Supported');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            resolve(`GPS: ${lat}, ${lng}`);
          },
          (err) => {
            console.warn('Geolocation error:', err);
            resolve('GPS: Permission Denied');
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      });

      const watermarkedUrl = await applyWatermark(file, propertyDetails || {}, gpsString);
      setPhotoBlob(watermarkedUrl);
      setPhotoPreview(watermarkedUrl);
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
        photoBase64 = photoBlob;
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
      backgroundColor: '#F8FAFC',
      color: '#09090B',
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
        <div style={{ background: '#09090B', padding: '8px', borderRadius: '10px', display: 'flex' }}>
          <Zap size={22} color="#ffffff" />
        </div>
        <span style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px', color: '#09090B' }}>
          Field<span>Watt</span>
        </span>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E4E4E7',
        borderRadius: '20px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>
        {loading ? (
          <div style={{ padding: '64px 24px', textAlign: 'center', color: '#475569' }}>
            <RefreshCw size={40} className="spinning" style={{ animation: 'spin 1.5s linear infinite', margin: '0 auto 20px', color: '#09090B' }} />
            <p style={{ fontSize: '14px', fontWeight: '500' }}>Retrieving your property details...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '48px 28px', textAlign: 'center' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '16px', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
              <AlertCircle size={44} style={{ color: '#ef4444' }} />
            </div>
            <h3 style={{ fontSize: '19px', fontWeight: '700', color: '#ef4444', marginBottom: '12px' }}>Link Expired or Invalid</h3>
            <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: '1.6', margin: 0 }}>{error}</p>
          </div>
        ) : submitSuccess ? (
          <div style={{ padding: '56px 28px', textAlign: 'center' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '16px', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
              <CheckCircle2 size={44} style={{ color: '#10b981' }} />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#09090B', marginBottom: '12px' }}>Reading Submitted!</h2>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: 0 }}>
              Thank you! Your meter reading and watermarked photo have been verified and successfully recorded.
            </p>
          </div>
        ) : (
          <div style={{ padding: '28px', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#09090B', textAlign: 'center', marginBottom: '24px' }}>
              Meter Reading Submission
            </h2>

            {/* Consumer Details Card */}
            <div style={{
              backgroundColor: '#F4F4F5',
              borderRadius: '14px',
              padding: '20px',
              border: '1px solid #E2E8F0',
              marginBottom: '28px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <User size={16} color="#334155" />
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>
                  {propertyDetails?.consumerName}
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', color: '#475569', fontSize: '13px', lineHeight: '1.4', marginBottom: '16px' }}>
                <MapPin size={15} style={{ color: '#334155', flexShrink: 0, marginTop: '2px' }} />
                <span>{propertyDetails?.address}</span>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '12px', 
                fontSize: '12.5px', 
                borderTop: '1px solid #E2E8F0', 
                paddingTop: '14px',
                color: '#475569'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={13} style={{ color: '#334155' }} />
                  <span>Meter: <strong style={{ color: '#0F172A' }}>{propertyDetails?.meterNo}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={13} style={{ color: '#334155' }} />
                  <span>BP: <strong style={{ color: '#0F172A' }}>{propertyDetails?.bpNo}</strong></span>
                </div>
              </div>
            </div>

            {submitError && (
              <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '10px', color: '#ef4444', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
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
                    backgroundColor: '#FFFFFF',
                    border: inputFocused ? '1px solid #18181B' : '1px solid #D4D4D8',
                    borderRadius: '10px',
                    color: '#09090B',
                    fontSize: '16px',
                    outline: 'none',
                    boxShadow: inputFocused ? '0 0 0 2px rgba(24, 24, 27, 0.1)' : 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease-in-out'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
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
                    backgroundColor: '#FAFAFA',
                    border: uploadHovered ? '2px dashed #000000' : '2px dashed #D4D4D8',
                    borderRadius: '12px',
                    color: uploadHovered ? '#000000' : '#27272A',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <div style={{ background: 'rgba(0, 0, 0, 0.05)', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={20} style={{ color: '#27272A' }} />
                  </div>
                  <span>{photoPreview ? 'Change Selection' : 'Capture or Upload Photo'}</span>
                </label>

                {processingPhoto && (
                  <div style={{
                    marginTop: '16px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    height: '180px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    backgroundColor: '#FAFAFA',
                    color: '#475569'
                  }}>
                    <RefreshCw size={24} className="spinning" style={{ color: '#09090B', animation: 'spin 1.5s linear infinite' }} />
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>Retrieving GPS & stamping watermark...</span>
                  </div>
                )}

                {photoPreview && !processingPhoto && (
                  <div style={{ marginTop: '16px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <img src={photoPreview} alt="Watermarked Verification" style={{ width: '100%', display: 'block', maxHeight: '220px', objectFit: 'contain', backgroundColor: '#000000' }} />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || processingPhoto}
                onMouseEnter={() => setBtnHovered(true)}
                onMouseLeave={() => setBtnHovered(false)}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: btnHovered ? '#27272A' : '#09090B',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting || processingPhoto ? 0.7 : 1,
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease-in-out',
                  marginTop: '8px'
                }}
              >
                {submitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <RefreshCw size={16} className="spinning" style={{ animation: 'spin 1.5s linear infinite', color: '#FFFFFF' }} />
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
