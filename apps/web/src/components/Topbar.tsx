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
    goList?: () => void;
    goSettings?: () => void;
    goConnect?: () => void;
  },
): BreadcrumbItem[] {
  switch (view) {
    case 'monitor':
      return [{ label: 'Live monitor', onClick: handlers?.goMonitor }];
    case 'list':
      return [
        { label: 'Monitor', onClick: handlers?.goMonitor },
        { label: 'Runs', onClick: handlers?.goList },
      ];
    case 'detail':
      return [
        { label: 'Monitor', onClick: handlers?.goMonitor },
        { label: 'Runs', onClick: handlers?.goList },
        { label: runTitle ?? 'Run detail' },
      ];
    case 'connect':
      return [
        { label: 'Monitor', onClick: handlers?.goMonitor },
        { label: 'Connect agents', onClick: handlers?.goConnect },
      ];
    case 'settings':
      return [
        { label: 'Monitor', onClick: handlers?.goMonitor },
        { label: 'API & keys', onClick: handlers?.goSettings },
      ];
    case 'users':
      return [
        { label: 'Monitor', onClick: handlers?.goMonitor },
        { label: 'Team' },
      ];
    default:
      return [{ label: 'Live monitor' }];
  }
}
