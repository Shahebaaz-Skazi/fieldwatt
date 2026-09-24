import React from 'react';

export const Badge = ({ children, variant = 'neutral', className = '', style }) => {
  const baseClass = "badge";
  let variantClass = "";
  
  if (variant === 'success') variantClass = "badge-success";
  else if (variant === 'warning' || variant === 'pending') variantClass = "badge-pending";
  else if (variant === 'danger' || variant === 'error') variantClass = "badge-danger";

  return (
    <span 
      className={`${baseClass} ${variantClass} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
};
