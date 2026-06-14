import React from 'react';

type BlamrLogoVariant = 'icon' | 'full';

interface BlamrLogoProps {
  variant?: BlamrLogoVariant;
  className?: string;
}

export function BlamrLogo({ variant = 'full', className = '' }: BlamrLogoProps) {
  const src = variant === 'icon' ? '/blamr_icon.svg' : '/blamr_logo.svg';
  const alt = 'blamr';
  const size =
    variant === 'icon'
      ? { width: 28, height: 28 }
      : { width: 168, height: 38 };

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={size.width}
      height={size.height}
      decoding="async"
    />
  );
}
