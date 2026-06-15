import React, { useState } from 'react';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  titleClassName?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className = '',
  titleClassName = '',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-section${open ? ' open' : ''} ${className}`.trim()}>
      <button
        type="button"
        className={`collapsible-header${titleClassName ? ` ${titleClassName}` : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="collapsible-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
        <span className="collapsible-title">{title}</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
