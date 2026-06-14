import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar, breadcrumbsForView } from './components/Topbar';
import { ToastContainer, useToasts } from './components/Toast';
import { KeyboardOverlay } from './components/KeyboardOverlay';
import { MonitorView } from './views/MonitorView';
import { RunsListView } from './views/RunsListView';
import { RunDetailView, nextDetailTab, type DetailTab } from './views/RunDetailView';
import { ConnectView } from './views/ConnectView';
import { SettingsView } from './views/SettingsView';
import { UsersView } from './views/UsersView';
import { LoginView, RegisterTenantView, AcceptInviteView } from './views/auth/AuthViews';
import { useRuns, useRunDetail } from './hooks/useRuns';
import { useAuth } from './auth/AuthContext';
import { hasApiCredentials } from './api/client';
import type { View, RunFilter, DetailSource } from './types';

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>('monitor');
  const [runFilter, setRunFilter] = useState<RunFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detailSource, setDetailSource] = useState<DetailSource>('list');
  const [detailTab, setDetailTab] = useState<DetailTab>('graph');
  const [showKb, setShowKb] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeNav, setActiveNav] = useState<string | undefined>('monitor');
  const kbBuf = useRef('');
  const kbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toasts, addToast, dismiss } = useToasts();
  const { runs, loading, error, reload } = useRuns(refreshKey, true);
  const { run: selectedRun } = useRunDetail(view === 'detail' ? selectedRunId : null, true);

  const goMonitor = useCallback(() => {
    setView('monitor');
    setSelectedRunId(null);
    setActiveNav('monitor');
  }, []);

  const goList = useCallback((filter?: RunFilter) => {
    setView('list');
    setSelectedRunId(null);
    if (filter) setRunFilter(filter);
    setActiveNav(filter === 'failed' ? 'na-fail' : filter === 'success' ? 'na-ok' : 'na-all');
  }, []);

  const goConnect = useCallback(() => {
    setView('connect');
    setSelectedRunId(null);
    setActiveNav('connect');
  }, []);

  const goSettings = useCallback(() => {
    setView('settings');
    setSelectedRunId(null);
    setActiveNav('settings');
  }, []);

  const goUsers = useCallback(() => {
    setView('users');
    setSelectedRunId(null);
    setActiveNav('users');
  }, []);

  const handleRunSelect = useCallback((id: string, from: DetailSource = 'list') => {
    setSelectedRunId(id);
    setDetailSource(from);
    setDetailTab('graph');
    setView('detail');
    const r = runs.find((x) => x.id === id);
    setActiveNav(r?.status === 'failed' ? 'na-fail' : 'na-ok');
  }, [runs]);

  const handleBack = useCallback(() => {
    setSelectedRunId(null);
    if (detailSource === 'monitor') goMonitor();
    else goList(runFilter);
  }, [detailSource, goMonitor, goList, runFilter]);

  const handleRefresh = useCallback(() => {
    reload();
    addToast('success', 'Refreshed');
    setRefreshKey((k) => k + 1);
  }, [reload, addToast]);

  const handleWorkflowFilter = useCallback((wf: string) => {
    setSearch(wf);
    goList('all');
  }, [goList]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === '?') { setShowKb(true); return; }
      if (e.key === 'Escape') {
        setShowKb(false);
        if (view === 'detail') handleBack();
        return;
      }
      if ((e.key === ']' || e.key === '[') && view === 'detail' && selectedRun) {
        setDetailTab((t) => nextDetailTab(selectedRun, t, e.key === ']' ? 1 : -1));
        return;
      }

      kbBuf.current += e.key.toUpperCase();
      if (kbTimer.current) clearTimeout(kbTimer.current);
      kbTimer.current = setTimeout(() => { kbBuf.current = ''; }, 800);
      if (kbBuf.current === 'GM') { goMonitor(); kbBuf.current = ''; }
      if (kbBuf.current === 'GR') { goList('all'); kbBuf.current = ''; }
      if (kbBuf.current === 'GC') { goConnect(); kbBuf.current = ''; }
      if (kbBuf.current === 'GK') { goSettings(); kbBuf.current = ''; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [view, selectedRun, handleBack, goMonitor, goList, goConnect, goSettings]);

  const handlers = { goMonitor, goList: () => goList('all'), goSettings, goConnect, goUsers };
  const breadcrumbs = breadcrumbsForView(view, selectedRun?.title, handlers);

  const copyId = () => {
    if (!selectedRunId) return;
    navigator.clipboard.writeText(selectedRunId).catch(() => {});
    addToast('success', `Copied: ${selectedRunId}`);
  };

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={(v) => { setView(v); setActiveNav(v); if (v !== 'detail') setSelectedRunId(null); }}
        runFilter={runFilter}
        setRunFilter={setRunFilter}
        search={search}
        setSearch={setSearch}
        onWorkflowFilter={handleWorkflowFilter}
        onShowKeyboard={() => setShowKb(true)}
        activeNav={activeNav}
        runs={runs}
        userEmail={user?.email}
        userRole={user?.role}
        onLogout={user ? logout : undefined}
        onUsers={goUsers}
      />

      <div className="main">
        <Topbar
          breadcrumbs={breadcrumbs}
          onShowKeyboard={view !== 'detail' ? () => setShowKb(true) : undefined}
          onRefresh={view === 'monitor' || view === 'list' ? handleRefresh : undefined}
          onBack={view === 'detail' ? handleBack : undefined}
          backLabel={detailSource === 'monitor' ? 'Monitor' : 'Runs'}
          onCopyId={view === 'detail' ? copyId : undefined}
        />
        <main className="content">
          {view === 'monitor' && (
            <MonitorView runs={runs} loading={loading} error={error} onRunSelect={(id) => handleRunSelect(id, 'monitor')} />
          )}
          {view === 'list' && (
            <RunsListView runs={runs} loading={loading} error={error} filter={runFilter} search={search} onRunSelect={(id) => handleRunSelect(id, 'list')} onFilterChange={(f) => { setRunFilter(f); setActiveNav(f === 'failed' ? 'na-fail' : f === 'success' ? 'na-ok' : 'na-all'); }} />
          )}
          {view === 'detail' && selectedRunId && (
            <RunDetailView runId={selectedRunId} tab={detailTab} onTabChange={setDetailTab} />
          )}
          {view === 'connect' && <ConnectView />}
          {view === 'settings' && <SettingsView onToast={addToast} />}
          {view === 'users' && <UsersView onToast={addToast} />}
        </main>
      </div>

      <div id="toast-wrap">
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>
      <KeyboardOverlay open={showKb} onClose={() => setShowKb(false)} />
    </div>
  );
}

export function App() {
  const { user, loading: authLoading, authScreen, inviteToken } = useAuth();
  const authenticated = Boolean(user) || hasApiCredentials();

  if (authLoading) {
    return <div className="auth-page"><div style={{ color: 'var(--mu)' }}>Loading…</div></div>;
  }

  if (!authenticated) {
    if (authScreen === 'register-tenant') return <RegisterTenantView />;
    if (authScreen === 'accept-invite' || inviteToken) return <AcceptInviteView />;
    return <LoginView />;
  }

  return <AuthenticatedApp />;
}
