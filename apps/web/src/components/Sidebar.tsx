import React, { useEffect, useState } from 'react';
import type { View, RunFilter } from '../types';
import { formatScaleCount } from '../utils/registry';
import type { UserRole } from '@blamr/types';
import { BlamrLogo } from './BlamrLogo';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import {
  IconSearch,
  IconList,
  IconAlert,
  IconCheck,
  IconLink,
  IconSettings,
} from './icons';

interface SidebarProps {
  view: View;
  setView: (v: View) => void;
  runFilter: RunFilter;
  setRunFilter: (f: RunFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  searchPlaceholder?: string;
  onShowKeyboard: () => void;
  activeNav?: string;
  runCount: number;
  totalRuns: number;
  failedCount: number;
  successCount: number;
  workflowCount: number;
  agentCount: number;
  userEmail?: string;
  userRole?: UserRole;
  onLogout?: () => void;
  onUsers?: () => void;
  onWorkspaceSwitch?: () => void;
}

export function Sidebar({
  view,
  setView,
  runFilter,
  setRunFilter,
  search,
  setSearch,
  searchPlaceholder = 'Search executions…',
  onShowKeyboard,
  activeNav,
  runCount,
  totalRuns,
  workflowCount,
  agentCount,
  failedCount,
  successCount,
  userEmail,
  userRole,
  onLogout,
  onUsers,
  onWorkspaceSwitch,
}: SidebarProps) {
  const [time, setTime] = useState(new Date());
  const searchRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const navClass = (id: string) =>
    `ni${activeNav === id || (activeNav === undefined && view === id) ? ' on' : ''}`;

  const clk = [
    time.getHours().toString().padStart(2, '0'),
    time.getMinutes().toString().padStart(2, '0'),
    time.getSeconds().toString().padStart(2, '0'),
  ].join(':');

  const execLabel = totalRuns > runCount ? formatScaleCount(totalRuns) : String(runCount);

  const goExecutions = (filter?: RunFilter) => {
    setView('list');
    if (filter) setRunFilter(filter);
  };

  return (
    <aside className="sidebar">
      <div className="logo-wrap">
        <BlamrLogo variant="full" className="logo-mark" />
        <span className="pulse-dot" />
      </div>

      <div className="sb-search">
        <IconSearch />
        <input
          ref={searchRef}
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (view !== 'list' && view !== 'detail' && view !== 'workflows' && view !== 'agents') {
              setView('list');
            }
          }}
        />
      </div>

      <div className="sidebar-scroll">
        <div className="sec-lbl">Observe</div>
        <button type="button" className={navClass('monitor')} onClick={() => setView('monitor')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Overview
        </button>
        <button type="button" className={navClass('workflows')} onClick={() => setView('workflows')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          Workflows
          <span className="ni-cnt">{formatScaleCount(workflowCount)}</span>
        </button>
        <button type="button" className={navClass('agents')} onClick={() => setView('agents')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          Agents
          <span className="ni-cnt">{formatScaleCount(agentCount)}</span>
        </button>

        <div className="sec-lbl">Executions</div>
        <button type="button" className={navClass('na-all')} onClick={() => goExecutions('all')}>
          <IconList /> All runs <span className="ni-cnt">{execLabel}</span>
        </button>
        <button type="button" className={navClass('na-fail')} onClick={() => goExecutions('failed')}>
          <IconAlert /> Failed {failedCount > 0 && <span className="ni-badge">{failedCount}</span>}
        </button>
        <button type="button" className={navClass('na-ok')} onClick={() => goExecutions('success')}>
          <IconCheck /> Success
        </button>

        <div className="sec-lbl">Configure</div>
        <button type="button" className={navClass('connect')} onClick={() => setView('connect')}>
          <IconLink /> Connect agents
        </button>
        <button type="button" className={navClass('settings')} onClick={() => setView('settings')}>
          <IconSettings /> API &amp; keys
        </button>
        {onUsers && (
          <button type="button" className={navClass('users')} onClick={onUsers}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Team
          </button>
        )}
      </div>

      <div className="sb-foot">
        <WorkspaceSwitcher onSwitched={onWorkspaceSwitch} />
        <div className="sb-foot-brand">blamr.ai</div>
        <div className="sb-foot-meta">
          {userEmail && (
            <>
              <span className="sb-foot-user">{userEmail}</span>
              {userRole && <span className="sb-foot-role">({userRole})</span>}
              <br />
            </>
          )}
          v0.1.0-beta
          <br />
          {onLogout && (
            <>
              <button type="button" className="sb-foot-link" onClick={onLogout}>Sign out</button>
              {' · '}
            </>
          )}
          <button type="button" className="sb-foot-link" onClick={onShowKeyboard}>Shortcuts ?</button>
          <span className="mono sb-foot-clock">{clk}</span>
        </div>
      </div>
    </aside>
  );
}
