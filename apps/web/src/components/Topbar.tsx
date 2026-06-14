import React from 'react';
import type { View, DetailSource } from '../types';
import { IconBack, IconKeyboard, IconRefresh, IconTok, IconCode } from './icons';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface TopbarProps {
  breadcrumbs: BreadcrumbItem[];
  onShowKeyboard?: () => void;
  onRefresh?: () => void;
  onBack?: () => void;
  backLabel?: string;
  onCopyId?: () => void;
  onExport?: () => void;
  detailSource?: DetailSource;
}

export function Topbar({
  breadcrumbs,
  onShowKeyboard,
  onRefresh,
  onBack,
  backLabel = 'Back',
  onCopyId,
  onExport,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="breadcrumb">
          {breadcrumbs.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="bc-sep">›</span>}
              {item.onClick ? (
                <button type="button" className="bc-item" onClick={item.onClick}>{item.label}</button>
              ) : (
                <span className={`bc-item${i === breadcrumbs.length - 1 ? ' current' : ''}`}>{item.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {onBack && (
          <button type="button" className="btn" onClick={onBack}>
            <IconBack /> {backLabel}
          </button>
        )}
        {onCopyId && (
          <button type="button" className="btn" onClick={onCopyId}>
            <IconTok /> Copy ID
          </button>
        )}
        {onExport && (
          <button type="button" className="btn" onClick={onExport}>
            <IconCode /> Export
          </button>
        )}
        {onShowKeyboard && (
          <button type="button" className="btn btn-icon" onClick={onShowKeyboard} title="Shortcuts ?">
            <IconKeyboard />
          </button>
        )}
        {onRefresh && (
          <button type="button" className="btn" onClick={onRefresh}>
            <IconRefresh /> Refresh
          </button>
        )}
      </div>
    </header>
  );
}

export function breadcrumbsForView(
  view: View,
  runTitle?: string,
  handlers?: {
    goMonitor?: () => void;
    goWorkflows?: () => void;
    goAgents?: () => void;
    goList?: () => void;
    goSettings?: () => void;
    goConnect?: () => void;
    goUsers?: () => void;
  },
  detailSource?: DetailSource,
): BreadcrumbItem[] {
  switch (view) {
    case 'monitor':
      return [{ label: 'Overview', onClick: handlers?.goMonitor }];
    case 'workflows':
      return [
        { label: 'Overview', onClick: handlers?.goMonitor },
        { label: 'Workflows', onClick: handlers?.goWorkflows },
      ];
    case 'agents':
      return [
        { label: 'Overview', onClick: handlers?.goMonitor },
        { label: 'Agents', onClick: handlers?.goAgents },
      ];
    case 'list':
      return [
        { label: 'Overview', onClick: handlers?.goMonitor },
        { label: 'Executions', onClick: handlers?.goList },
      ];
    case 'detail':
      return [
        { label: 'Overview', onClick: handlers?.goMonitor },
        { label: detailSource === 'monitor' ? 'Overview' : 'Executions', onClick: detailSource === 'monitor' ? handlers?.goMonitor : handlers?.goList },
        { label: runTitle ?? 'Run detail' },
      ];
    case 'connect':
      return [
        { label: 'Overview', onClick: handlers?.goMonitor },
        { label: 'Connect agents', onClick: handlers?.goConnect },
      ];
    case 'settings':
      return [
        { label: 'Overview', onClick: handlers?.goMonitor },
        { label: 'API & keys', onClick: handlers?.goSettings },
      ];
    case 'users':
      return [
        { label: 'Overview', onClick: handlers?.goMonitor },
        { label: 'Team', onClick: handlers?.goUsers },
      ];
    default:
      return [{ label: 'Overview' }];
  }
}
