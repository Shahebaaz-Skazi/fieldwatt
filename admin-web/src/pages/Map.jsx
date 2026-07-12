import React, { useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import L from 'leaflet';
import { MapPin, Navigation } from 'lucide-react';

const MapView = () => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

  const [areas, setAreas] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Centered on default city location (Pune coordinates fallback as per PRD info)
    mapInstanceRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      fadeAnimation: false,
    }).setView([18.5204, 73.8567], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(mapInstanceRef.current);

    markersLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Fetch Areas List
  useEffect(() => {
    api.get('/admin/areas')
      .then(data => {
        setAreas(data);
        if (data.length > 0) {
          setSelectedAreaId(data[0].id);
        }
      })
      .catch(err => console.error('Error fetching areas for map:', err));
  }, []);

  // Fetch Properties and render markers on area selection change
  useEffect(() => {
    if (!selectedAreaId || !mapInstanceRef.current || !markersLayerRef.current) return;

    setLoading(true);
    // Fetch all properties in area to display on map
    api.get(`/admin/areas/${selectedAreaId}/properties?limit=500`)
      .then(response => {
        setProperties(response.properties);
        
        // Clear previous markers
        markersLayerRef.current.clearLayers();

        const bounds = [];

        response.properties.forEach(prop => {
          // Fallback coordinate generation for simulation if properties lack GPS (ponytail: mock coordinates near city center for visual layout)
          const lat = prop.lat ? parseFloat(prop.lat) : (18.5204 + (Math.random() - 0.5) * 0.04);
          const lng = prop.lng ? parseFloat(prop.lng) : (73.8567 + (Math.random() - 0.5) * 0.04);

          bounds.push([lat, lng]);

          // Marker color based on reading status
          let color = '#ef4444'; // Red = pending
          if (prop.reading_status === 'reading_taken') {
            color = '#10b981'; // Green = done
          } else if (prop.reading_status && prop.reading_status !== 'reading_taken') {
            color = '#f5a623'; // Orange = problem
          }

          const markerHtml = `
            <div style="
              background-color: ${color}; 
              width: 14px; 
              height: 14px; 
              border-radius: 50%; 
              border: 2px solid #fff; 
              box-shadow: 0 0 8px rgba(0,0,0,0.4);
            "></div>
          `;

          const customIcon = L.divIcon({
            html: markerHtml,
            className: 'custom-map-marker',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });

          const popupContent = `
            <div style="font-family: sans-serif; font-size: 12px; color: #111;">
              <strong style="font-size: 13px;">Serial: ${prop.serial_no}</strong><br/>
              <b>Consumer:</b> ${prop.consumer_name}<br/>
              <b>Address:</b> ${prop.address}<br/>
              <b>Meter:</b> ${prop.meter_no || 'N/A'}<br/>
              <b>Status:</b> <span style="text-transform: capitalize; color: ${color}; font-weight: bold;">${(prop.reading_status || 'Pending').replace('_', ' ')}</span>
            </div>
          `;

          L.marker([lat, lng], { icon: customIcon })
            .bindPopup(popupContent)
            .addTo(markersLayerRef.current);
        });

        // Fit map view bounds
        if (bounds.length > 0 && mapInstanceRef.current) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
        }
      })
      .catch(err => console.error('Error loading properties for map:', err))
      .finally(() => setLoading(false));
  }, [selectedAreaId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Live Geo-Tracking</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Visual overview of meter locations and verification pins</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <MapPin size={16} style={{ color: 'var(--muted)' }} />
          <select
            className="form-input"
            value={selectedAreaId}
            onChange={(e) => setSelectedAreaId(e.target.value)}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            <option value="">Select Area...</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', backgroundColor: 'var(--surface)' }}>
        {loading && (
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            padding: '8px 16px',
            borderRadius: '8px',
            zIndex: 1000,
            fontSize: '12px',
            color: 'var(--text)'
          }}>
            Loading pins...
          </div>
        )}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
      </div>
    </div>
  );
};

export default MapView;
