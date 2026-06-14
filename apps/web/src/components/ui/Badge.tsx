import React from 'react';

type BadgeVariant = 'red' | 'grn' | 'amb' | 'cyn' | 'vi' | 'mu';

export function Badge({ children, variant = 'mu' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return <span className={`bdg bdg-${variant}`}>{children}</span>;
}
