import React from 'react';
import { X } from 'lucide-react';

const ZoomPhotoModal = ({ zoomPhoto, setZoomPhoto }) => {
  if (!zoomPhoto) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      padding: '24px'
    }}>
      <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
        <button
          onClick={() => setZoomPhoto(null)}
          style={{
            position: 'absolute',
            top: '-40px',
            right: 0,
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          <X size={32} />
        </button>
        <img
          src={zoomPhoto}
          alt="Zoomed Reading"
          style={{
            maxWidth: '100%',
            maxHeight: '90vh',
            objectFit: 'contain',
            borderRadius: '8px'
          }}
        />
      </div>
    </div>
  );
};

export default ZoomPhotoModal;
