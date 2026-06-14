import React from 'react';

type ChipColor = '' | 'red' | 'grn' | 'amb' | 'cyn';

export function FilterChip({
  label,
  active,
  color = '',
  onClick,
}: {
  label: string;
  active: boolean;
  color?: ChipColor;
  onClick: () => void;
}) {
  const cls = ['fchip', color ? `fchip-${color}` : '', active ? 'on' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick}>
      {label}
    </button>
  );
}
