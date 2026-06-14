import React from 'react';
import { hasApiCredentials } from '../api/client';

export function ApiBanner({ error }: { error?: string | null }) {
  if (!hasApiCredentials()) {
    return (
      <div style={{
        background: 'var(--goD)', border: '1px solid rgba(215,119,6,.28)', borderRadius: 'var(--rad)',
        padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: 'var(--goL)', lineHeight: 1.5,
      }}>
        Sign in or set <code style={{ fontFamily: 'var(--mono)' }}>VITE_API_KEY</code> to load live data from the API.
      </div>
    );
  }
  if (error) {
    return (
      <div style={{
        background: 'var(--reD)', border: '1px solid rgba(220,38,38,.28)', borderRadius: 'var(--rad)',
        padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: 'var(--reL)', lineHeight: 1.5,
      }}>
        {error}
      </div>
    );
  }
  return null;
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--mu)' }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>○</div>
      <div style={{ fontSize: 14 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}
