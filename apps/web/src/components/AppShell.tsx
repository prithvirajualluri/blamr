import React from 'react';

type AppShellVariant = 'app' | 'landing' | 'auth';

interface AppShellProps {
  children: React.ReactNode;
  variant?: AppShellVariant;
  className?: string;
}

/** Marketing-site ambient shell (grid + glow) for app, auth, and landing. */
export function AppShell({ children, variant = 'app', className = '' }: AppShellProps) {
  return (
    <div className={`blamr-shell landing blamr-shell-${variant}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
