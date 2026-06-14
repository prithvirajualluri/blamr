import React from 'react';
import type { BlamrConnectionStatus } from '@blamr/types';
import { BLAMR_STATUS_HINT, BLAMR_STATUS_LABEL } from '../utils/blamr-status';

interface BlamrStatusBadgeProps {
  status: BlamrConnectionStatus;
  compact?: boolean;
  showDot?: boolean;
}

const STATUS_COLOR: Record<BlamrConnectionStatus, string> = {
  live: 'var(--grL)',
  idle: 'var(--goL)',
  offline: 'var(--mu)',
};

const STATUS_BG: Record<BlamrConnectionStatus, string> = {
  live: 'var(--grD)',
  idle: 'rgba(215,119,6,.12)',
  offline: 'var(--bg3)',
};

const STATUS_BORDER: Record<BlamrConnectionStatus, string> = {
  live: 'rgba(5,150,105,.35)',
  idle: 'rgba(215,119,6,.35)',
  offline: 'var(--b0)',
};

export function BlamrStatusDot({ status }: { status: BlamrConnectionStatus }) {
  return (
    <span
      className={`blamr-status-dot${status === 'live' ? ' live' : ''}`}
      style={{ background: STATUS_COLOR[status] }}
      title={BLAMR_STATUS_HINT[status]}
    />
  );
}

export function BlamrStatusBadge({ status, compact = false, showDot = true }: BlamrStatusBadgeProps) {
  return (
    <span
      className="blamr-status-badge"
      title={BLAMR_STATUS_HINT[status]}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 5,
        fontSize: compact ? 10 : 11,
        fontWeight: 500,
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: 999,
        color: STATUS_COLOR[status],
        background: STATUS_BG[status],
        border: `1px solid ${STATUS_BORDER[status]}`,
        whiteSpace: 'nowrap',
      }}
    >
      {showDot && <BlamrStatusDot status={status} />}
      {compact ? BLAMR_STATUS_LABEL[status] : `blamr · ${BLAMR_STATUS_LABEL[status]}`}
    </span>
  );
}

export function RunTraceBadge({ tracing }: { tracing: boolean }) {
  return tracing ? (
    <BlamrStatusBadge status="live" compact showDot />
  ) : (
    <span
      className="blamr-status-badge"
      title="Listed on run but no causal edges ingested"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 999,
        color: 'var(--mu)',
        background: 'var(--bg3)',
        border: '1px solid var(--b0)',
      }}
    >
      <span className="blamr-status-dot" style={{ background: 'var(--mu)' }} />
      No edges
    </span>
  );
}
