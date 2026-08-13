export const applyAdminWatermark = (file, propertyDetails) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const pad = Math.max(16, img.width * 0.018);
      const fontSize = Math.max(20, img.width * 0.022);
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.lineWidth = Math.max(3, fontSize * 0.15);

      const drawText = (text, x, y) => {
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = 'rgba(255,255,0,0.95)';
        ctx.fillText(text, x, y);
      };

      const now = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });

      ctx.textAlign = 'left';
      drawText(propertyDetails.consumerName || 'Admin Edit', pad, pad + fontSize);

      ctx.textAlign = 'right';
      drawText(now, canvas.width - pad, pad + fontSize);

      ctx.textAlign = 'left';
      drawText(`Meter: ${propertyDetails.meterNo || ''}`, pad, canvas.height - pad - fontSize * 1.4);
      drawText(`BP: ${propertyDetails.bpNo || ''}`, pad, canvas.height - pad);

      ctx.textAlign = 'right';
      drawText('FieldWatt-Admin', canvas.width - pad, canvas.height - pad);

      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
    };
    img.src = URL.createObjectURL(file);
  });
};
