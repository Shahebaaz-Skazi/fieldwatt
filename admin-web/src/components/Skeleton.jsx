import React from 'react';

const Skeleton = ({ className, style }) => {
  return (
    <>
      <style>{`
        @keyframes pulse-anim {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .skeleton-pulse {
          animation: pulse-anim 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
      <div
        className={`skeleton-pulse ${className || ''}`}
        style={{
          backgroundColor: 'var(--border-light, #f3f4f6)',
          borderRadius: '8px',
          ...style,
        }}
      />
    </>
  );
};

export const DashboardSkeleton = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', padding: '20px 0', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Skeleton style={{ width: '300px', height: '40px', marginBottom: '8px' }} />
          <Skeleton style={{ width: '450px', height: '20px' }} />
        </div>
      </div>
      
      {/* 4 Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ 
            background: 'var(--surface, #ffffff)', 
            border: '1px solid var(--border, #e5e7eb)', 
            borderRadius: '16px', 
            padding: '24px', 
            height: '140px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <Skeleton style={{ width: '44px', height: '44px', borderRadius: '10px' }} />
            <Skeleton style={{ width: '80px', height: '16px' }} />
            <Skeleton style={{ width: '120px', height: '36px' }} />
          </div>
        ))}
      </div>
      
      {/* Large list area */}
      <div style={{ 
        background: 'var(--surface, #ffffff)', 
        border: '1px solid var(--border, #e5e7eb)', 
        borderRadius: '16px', 
        padding: '24px', 
        height: '400px'
      }}>
        <Skeleton style={{ width: '200px', height: '24px', marginBottom: '24px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} style={{ width: '100%', height: '48px', borderRadius: '8px' }} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Skeleton;
