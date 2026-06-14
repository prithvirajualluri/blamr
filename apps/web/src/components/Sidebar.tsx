import React, { useEffect, useMemo, useState } from 'react';
import type { View, RunFilter, RunSummary } from '../types';
import { groupRunsByWorkflow } from '../types';
import type { UserRole } from '@blamr/types';
import { getWorkflowCounts } from '../utils/runs';
import { BlamrStatusDot } from './BlamrStatusBadge';
import { IconSearch, IconList, IconAlert, IconCheck, IconLink, IconSettings } from './icons';

interface SidebarProps {
  view: View;
  setView: (v: View) => void;
  runFilter: RunFilter;
  setRunFilter: (f: RunFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  onWorkflowFilter: (workflow: string) => void;
  onShowKeyboard: () => void;
  activeNav?: string;
  runs: RunSummary[];
  userEmail?: string;
  userRole?: UserRole;
  onLogout?: () => void;
  onUsers?: () => void;
}

export function Sidebar({
  view,
  setView,
  runFilter,
  setRunFilter,
  search,
  setSearch,
  onWorkflowFilter,
  onShowKeyboard,
  activeNav,
  runs,
  userEmail,
  userRole,
  onLogout,
  onUsers,
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

  const failedCount = runs.filter((r) => r.status === 'failed').length;
  const successCount = runs.filter((r) => r.status === 'success').length;
  const wfCounts = getWorkflowCounts(runs);
  const wfStatus = useMemo(() => {
    const m = new Map<string, ReturnType<typeof groupRunsByWorkflow>[number]['blamrStatus']>();
    for (const wf of groupRunsByWorkflow(runs)) m.set(wf.id, wf.blamrStatus);
    return m;
  }, [runs]);

  const navClass = (id: string) => `ni${activeNav === id || (activeNav === undefined && view === id) ? ' on' : ''}`;

  const clk = [
    time.getHours().toString().padStart(2, '0'),
    time.getMinutes().toString().padStart(2, '0'),
    time.getSeconds().toString().padStart(2, '0'),
  ].join(':');

  return (
    <aside className="sidebar">
      <div className="logo-wrap">
        <span className="logo-text">blamr</span>
        <span className="pulse-dot" />
      </div>

      <div className="sb-search">
        <IconSearch />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search workflows, runs..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (view !== 'list' && view !== 'detail') setView('list');
          }}
        />
      </div>

      <div className="sec-lbl">Platform</div>
      <button type="button" className={navClass('monitor')} onClick={() => setView('monitor')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        Live monitor
        <span className="pulse-dot" style={{ width: 5, height: 5, marginLeft: 'auto' }} />
      </button>

      <div className="sec-lbl" style={{ marginTop: 4 }}>Runs</div>
      <button type="button" className={navClass('na-all')} onClick={() => { setView('list'); setRunFilter('all'); }}>
        <IconList /> All runs <span className="ni-cnt">{runs.length}</span>
      </button>
      <button type="button" className={navClass('na-fail')} onClick={() => { setView('list'); setRunFilter('failed'); }}>
        <IconAlert /> Failed {failedCount > 0 && <span className="ni-badge">{failedCount}</span>}
      </button>
      <button type="button" className={navClass('na-ok')} onClick={() => { setView('list'); setRunFilter('success'); }}>
        <IconCheck /> Success <span className="ni-cnt">{successCount}</span>
      </button>

      {Object.keys(wfCounts).length > 0 && (
        <>
          <div className="sec-lbl" style={{ marginTop: 4 }}>Workflows</div>
          {Object.keys(wfCounts).map((w) => (
            <button key={w} type="button" className="ni" onClick={() => onWorkflowFilter(w)}>
              <BlamrStatusDot status={wfStatus.get(w) ?? 'offline'} />
              <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w}</span>
              <span className="ni-cnt">{wfCounts[w]}</span>
            </button>
          ))}
        </>
      )}

      <div className="sec-lbl" style={{ marginTop: 4 }}>Tools</div>
      <button type="button" className={navClass('connect')} onClick={() => setView('connect')}><IconLink /> Connect agents</button>
      <button type="button" className={navClass('settings')} onClick={() => setView('settings')}><IconSettings /> API &amp; keys</button>
      {onUsers && (
        <button type="button" className={navClass('users')} onClick={onUsers}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Team
        </button>
      )}

      <div className="sb-foot">
        <div className="sb-foot-brand">blamr.ai</div>
        <div style={{ fontSize: 11, color: 'var(--mu)', lineHeight: 1.7 }}>
          {userEmail && (
            <>
              <span style={{ color: 'var(--wh)' }}>{userEmail}</span>
              {userRole && <span style={{ marginLeft: 6, color: 'var(--cy)' }}>({userRole})</span>}
              <br />
            </>
          )}
          v0.1.0-beta
          <br />
          {onLogout && (
            <>
              <span style={{ cursor: 'pointer', color: 'var(--cy)' }} onClick={onLogout} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onLogout()}>Sign out</span>
              {' · '}
            </>
          )}
          <span style={{ cursor: 'pointer', color: 'var(--cy)' }} onClick={onShowKeyboard} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onShowKeyboard()}>Shortcuts ?</span>
          <span id="live-clk" className="mono" style={{ float: 'right' }}>{clk}</span>
        </div>
      </div>
    </aside>
  );
}
