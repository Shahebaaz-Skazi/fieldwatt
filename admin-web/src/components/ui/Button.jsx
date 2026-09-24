import React from 'react';

export const Button = ({ children, variant = 'primary', className = '', style, ...props }) => {
  const baseClass = "btn";
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : '';
  
  return (
    <button 
      className={`${baseClass} ${variantClass} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
};
