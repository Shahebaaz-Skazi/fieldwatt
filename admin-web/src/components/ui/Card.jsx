import React from 'react';

export const Card = ({ children, className = '', style }) => {
  return (
    <div 
      className={`widget-card ${className}`}
      style={{ padding: '24px', ...style }}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ title, subtitle, rightElement }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
    <div>
      <h3 style={{ fontWeight: '700', color: 'var(--text)', fontSize: '16px', margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0 0' }}>{subtitle}</p>}
    </div>
    {rightElement && <div>{rightElement}</div>}
  </div>
);

export const CardContent = ({ children, className = '', style }) => (
  <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '16px', ...style }}>
    {children}
  </div>
);
