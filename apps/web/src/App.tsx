import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar, breadcrumbsForView } from './components/Topbar';
import { ToastContainer, useToasts } from './components/Toast';
import { KeyboardOverlay } from './components/KeyboardOverlay';
import { MonitorView } from './views/MonitorView';
import { WorkflowsView } from './views/WorkflowsView';
import { AgentsView } from './views/AgentsView';
import { RunsListView } from './views/RunsListView';
import { RunDetailView, nextDetailTab, type DetailTab } from './views/RunDetailView';
import { ConnectView } from './views/ConnectView';
import { SettingsView } from './views/SettingsView';
import { UsersView } from './views/UsersView';
import { LoginView, RegisterTenantView, AcceptInviteView } from './views/auth/AuthViews';
import { LandingView } from './views/LandingView';
import {
  useMetricsOverview,
  usePaginatedRuns,
  useWorkflowsList,
  useAgentsList,
  useRunDetail,
} from './hooks/useRuns';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { hasApiCredentials, setUnauthorizedHandler } from './api/client';
import { navigateTo, useIsOperatorApp } from './routing';
import { AppShell } from './components/AppShell';
import { FirstTimeOnboarding } from './components/FirstTimeOnboarding';
import type { OnboardingVariant } from './components/FirstTimeOnboarding';
import { isOnboardingComplete, markOnboardingComplete } from './auth/onboarding';
import {
  parseAppRoute,
  hashForRoute,
  navIdForView,
  runFilterFromHash,
} from './app-routing';
import { exportRunNdjson } from './api/runs';
import type { AgentApiRow } from './api/runs';
import { RUNS_PAGE_SIZE } from './utils/registry';
import type { View, RunFilter, DetailSource } from './types';

function AuthenticatedApp() {
  const { user, logout, onboardingTrigger, clearOnboardingTrigger } = useAuth();
  const initialRoute = parseAppRoute();
  const [view, setViewState] = useState<View>(initialRoute.view);
  const [runFilter, setRunFilter] = useState<RunFilter>(() => runFilterFromHash());
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState<string | undefined>(initialRoute.scopeWorkflowId);
  const [agentFilter, setAgentFilter] = useState<string | undefined>(initialRoute.scopeAgentId);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRoute.runId ?? null);
  const [detailSource, setDetailSource] = useState<DetailSource>('list');
  const [detailTab, setDetailTab] = useState<DetailTab>('graph');
  const [showKb, setShowKb] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingVariant, setOnboardingVariant] = useState<OnboardingVariant>('empty-workspace');
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeNav, setActiveNav] = useState(() => navIdForView(initialRoute.view, runFilterFromHash()));
  const [execPage, setExecPage] = useState(1);
  const [wfPage, setWfPage] = useState(1);
  const [agentPage, setAgentPage] = useState(1);
  const [wfHealth, setWfHealth] = useState('all');
  const [wfSort, setWfSort] = useState('runs');
  const kbBuf = useRef('');
  const kbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toasts, addToast, dismiss } = useToasts();

  const { metrics, loading: metricsLoading, error: metricsError, reload: reloadMetrics } = useMetricsOverview(refreshKey);
  const { workflows: topWorkflows, total: workflowsTotal, loading: wfLoading, error: wfError } = useWorkflowsList(
    { limit: 12, offset: 0, health: wfHealth === 'all' ? undefined : wfHealth, sort: wfSort },
    refreshKey,
    view === 'monitor',
  );
  const { workflows: wfList, total: wfListTotal, loading: wfListLoading, error: wfListError } = useWorkflowsList(
    { limit: 40, offset: (wfPage - 1) * 40, q: view === 'workflows' ? search : undefined, health: wfHealth === 'all' ? undefined : wfHealth, sort: wfSort },
    refreshKey,
    view === 'workflows',
  );
  const { agents, total: agentsTotal, uniqueAgents: agentsUnique, loading: agentsLoading, error: agentsError } = useAgentsList(
    { limit: 40, offset: (agentPage - 1) * 40, q: view === 'agents' ? search : undefined },
    refreshKey,
    view === 'agents',
  );
  const execStatus = runFilter === 'all' ? undefined : runFilter;
  const { runs, total: runsTotal, counts, loading: runsLoading, error: runsError } = usePaginatedRuns(
    {
      status: execStatus,
      workflow_id: workflowFilter,
      agent_id: agentFilter,
      q: view === 'list' ? search : undefined,
      limit: RUNS_PAGE_SIZE,
      offset: (execPage - 1) * RUNS_PAGE_SIZE,
    },
    refreshKey,
    view === 'list' || view === 'detail',
  );
  const { runs: recentFailures } = usePaginatedRuns(
    { status: 'failed', limit: 8, offset: 0 },
    refreshKey,
    view === 'monitor',
  );
  const { run: selectedRun, loading: detailLoading, error: detailError } = useRunDetail(view === 'detail' ? selectedRunId : null, view === 'detail');

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      addToast('warn', 'Session expired — please sign in again');
    });
    return () => setUnauthorizedHandler(null);
  }, [logout, addToast]);

  const pushRoute = useCallback((
    nextView: View,
    runId?: string | null,
    filter?: RunFilter,
    scope?: { workflowId?: string; agentId?: string },
  ) => {
    const hash = hashForRoute(
      {
        view: nextView,
        runId: runId ?? undefined,
        scopeWorkflowId: scope?.workflowId,
        scopeAgentId: scope?.agentId,
      },
      filter ?? runFilter,
    );
    window.history.pushState(null, '', hash);
  }, [runFilter]);

  const setView = useCallback((v: View, opts?: {
    runId?: string | null;
    filter?: RunFilter;
    source?: DetailSource;
    scope?: { workflowId?: string; agentId?: string };
  }) => {
    setViewState(v);
    if (v !== 'list' && v !== 'detail') {
      setWorkflowFilter(undefined);
      setAgentFilter(undefined);
    }
    if (opts?.filter) setRunFilter(opts.filter);
    if (v === 'detail' && opts?.runId) {
      setSelectedRunId(opts.runId);
      if (opts.source) setDetailSource(opts.source);
      pushRoute('detail', opts.runId);
      setActiveNav(navIdForView('list', opts.filter ?? runFilter));
    } else if (v !== 'detail') {
      setSelectedRunId(null);
      if (v === 'list' && opts?.scope) {
        if ('workflowId' in opts.scope) setWorkflowFilter(opts.scope.workflowId);
        if ('agentId' in opts.scope) setAgentFilter(opts.scope.agentId);
      }
      const scope = v === 'list'
        ? { workflowId: opts?.scope?.workflowId, agentId: opts?.scope?.agentId }
        : undefined;
      pushRoute(v, null, opts?.filter ?? runFilter, scope);
      setActiveNav(navIdForView(v, opts?.filter ?? runFilter));
    }
  }, [pushRoute, runFilter]);

  const syncFromHash = useCallback(() => {
    const route = parseAppRoute();
    const filter = runFilterFromHash();
    setRunFilter(filter);
    if (route.view === 'detail' && route.runId) {
      setViewState('detail');
      setSelectedRunId(route.runId);
      setActiveNav(navIdForView('list', filter));
    } else {
      setViewState(route.view);
      setSelectedRunId(null);
      setActiveNav(navIdForView(route.view, filter));
      if (route.view === 'list') {
        setWorkflowFilter(route.scopeWorkflowId);
        setAgentFilter(route.scopeAgentId);
      } else {
        setWorkflowFilter(undefined);
        setAgentFilter(undefined);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.removeEventListener('popstate', syncFromHash);
    };
  }, [syncFromHash]);

  useEffect(() => {
    if (!user) {
      setShowOnboarding(false);
      return;
    }
    if (isOnboardingComplete(user.workspace_id)) {
      setShowOnboarding(false);
      clearOnboardingTrigger();
      return;
    }
    if (onboardingTrigger) {
      setOnboardingVariant(onboardingTrigger);
      setShowOnboarding(true);
      return;
    }
    if (!metricsLoading && metrics && metrics.executions.total === 0) {
      setOnboardingVariant('empty-workspace');
      setShowOnboarding(true);
    }
  }, [user, onboardingTrigger, metricsLoading, metrics, clearOnboardingTrigger]);

  const goMonitor = useCallback(() => setView('monitor'), [setView]);
  const goWorkflows = useCallback(() => { setWfPage(1); setView('workflows'); }, [setView]);
  const goAgents = useCallback(() => { setAgentPage(1); setView('agents'); }, [setView]);
  const goList = useCallback((filter?: RunFilter, scope?: { workflowId?: string; agentId?: string }) => {
    setExecPage(1);
    if (scope?.workflowId !== undefined) setWorkflowFilter(scope.workflowId);
    if (scope?.agentId !== undefined) setAgentFilter(scope.agentId);
    setView('list', { filter: filter ?? 'all', scope });
  }, [setView]);
  const goConnect = useCallback(() => setView('connect'), [setView]);
  const goSettings = useCallback(() => setView('settings'), [setView]);
  const goUsers = useCallback(() => setView('users'), [setView]);

  const dismissOnboarding = useCallback(() => {
    if (user) markOnboardingComplete(user.workspace_id);
    clearOnboardingTrigger();
    setShowOnboarding(false);
  }, [user, clearOnboardingTrigger]);

  const onboardingGoSettings = useCallback(() => {
    if (user) markOnboardingComplete(user.workspace_id);
    clearOnboardingTrigger();
    setShowOnboarding(false);
    goSettings();
  }, [user, clearOnboardingTrigger, goSettings]);

  const onboardingGoConnect = useCallback(() => {
    if (user) markOnboardingComplete(user.workspace_id);
    clearOnboardingTrigger();
    setShowOnboarding(false);
    goConnect();
  }, [user, clearOnboardingTrigger, goConnect]);

  const handleRunSelect = useCallback((id: string, from: DetailSource = 'list') => {
    setDetailSource(from);
    setDetailTab('graph');
    setView('detail', { runId: id, source: from });
  }, [setView]);

  const handleBack = useCallback(() => {
    setSelectedRunId(null);
    if (detailSource === 'monitor') goMonitor();
    else if (detailSource === 'agents') goAgents();
    else goList(runFilter, { workflowId: workflowFilter, agentId: agentFilter });
  }, [detailSource, goMonitor, goAgents, goList, runFilter, workflowFilter, agentFilter]);

  const handleRefresh = useCallback(async () => {
    try {
      await reloadMetrics();
      setRefreshKey((k) => k + 1);
      addToast('success', 'Refreshed');
    } catch {
      addToast('error', 'Refresh failed');
    }
  }, [reloadMetrics, addToast]);

  const handleWorkflowSelect = useCallback((wf: string) => {
    setWorkflowFilter(wf);
    setAgentFilter(undefined);
    setSearch('');
    setExecPage(1);
    goList('all', { workflowId: wf, agentId: undefined });
  }, [goList]);

  const handleAgentSelect = useCallback((agent: AgentApiRow) => {
    setWorkflowFilter(agent.workflow_id);
    setAgentFilter(agent.id);
    setSearch('');
    setExecPage(1);
    if (agent.latest_run_id) {
      setDetailSource('agents');
      setDetailTab('trace');
      setView('detail', { runId: agent.latest_run_id, source: 'agents' });
      return;
    }
    goList('all', { workflowId: agent.workflow_id, agentId: agent.id });
  }, [goList, setView]);

  const handleAgentViewAllRuns = useCallback((agent: AgentApiRow) => {
    setWorkflowFilter(agent.workflow_id);
    setAgentFilter(agent.id);
    setSearch('');
    setExecPage(1);
    goList('all', { workflowId: agent.workflow_id, agentId: agent.id });
  }, [goList]);

  const handleClearWorkflowFilter = useCallback(() => {
    setWorkflowFilter(undefined);
    setAgentFilter(undefined);
    setExecPage(1);
    goList(runFilter, { workflowId: undefined, agentId: undefined });
  }, [goList, runFilter]);

  useEffect(() => {
    setExecPage(1);
  }, [search, runFilter, workflowFilter, agentFilter]);

  useEffect(() => {
    setWfPage(1);
  }, [search, wfHealth, wfSort]);

  useEffect(() => {
    setAgentPage(1);
  }, [search]);

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
      if (kbBuf.current === 'GW') { goWorkflows(); kbBuf.current = ''; }
      if (kbBuf.current === 'GR') { goList('all'); kbBuf.current = ''; }
      if (kbBuf.current === 'GC') { goConnect(); kbBuf.current = ''; }
      if (kbBuf.current === 'GK') { goSettings(); kbBuf.current = ''; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [view, selectedRun, handleBack, goMonitor, goWorkflows, goList, goConnect, goSettings]);

  const handlers = { goMonitor, goWorkflows, goList: () => goList('all'), goSettings, goConnect, goUsers, goAgents };
  const breadcrumbs = breadcrumbsForView(view, selectedRun?.title ?? selectedRunId ?? undefined, handlers, detailSource);

  const copyId = () => {
    if (!selectedRunId) return;
    navigator.clipboard.writeText(selectedRunId).catch(() => {});
    addToast('success', `Copied: ${selectedRunId}`);
  };

  const handleExport = async () => {
    if (!selectedRunId) return;
    try {
      await exportRunNdjson(selectedRunId);
      addToast('success', 'Export downloaded');
    } catch {
      addToast('error', 'Export failed');
    }
  };

  const sidebarSetView = useCallback((v: View) => {
    if (v === 'list') goList(runFilter);
    else setView(v);
  }, [goList, runFilter, setView]);

  return (
    <AppShell variant="app">
      <div className="app">
      <Sidebar
        view={view}
        setView={sidebarSetView}
        runFilter={runFilter}
        setRunFilter={(f) => goList(f)}
        search={search}
        setSearch={setSearch}
        searchPlaceholder={
          view === 'workflows' ? 'Search workflows…' :
          view === 'agents' ? 'Search agents…' :
          'Search executions…'
        }
        onShowKeyboard={() => setShowKb(true)}
        activeNav={activeNav}
        runCount={runsTotal}
        totalRuns={runsTotal}
        failedCount={counts.failed}
        successCount={counts.success}
        workflowCount={metrics?.workflows.total ?? workflowsTotal}
        agentCount={metrics?.agents.total ?? agentsTotal}
        userEmail={user?.email}
        userRole={user?.role}
        onLogout={user ? logout : undefined}
        onUsers={goUsers}
        onWorkspaceSwitch={() => setRefreshKey((k) => k + 1)}
      />

      <div className="main">
        <Topbar
          breadcrumbs={breadcrumbs}
          onShowKeyboard={view !== 'detail' ? () => setShowKb(true) : undefined}
          onRefresh={view !== 'detail' ? handleRefresh : undefined}
          onBack={view === 'detail' ? handleBack : undefined}
          backLabel={detailSource === 'monitor' ? 'Overview' : detailSource === 'agents' ? 'Agents' : 'Executions'}
          onCopyId={view === 'detail' ? copyId : undefined}
          onExport={view === 'detail' ? handleExport : undefined}
          detailSource={detailSource}
        />
        <main className="content">
          {view === 'monitor' && (
            <MonitorView
              metrics={metrics}
              workflows={topWorkflows}
              workflowsTotal={workflowsTotal}
              wfHealth={wfHealth}
              wfSort={wfSort}
              onWfHealthChange={setWfHealth}
              onWfSortChange={setWfSort}
              recentFailures={recentFailures}
              loading={metricsLoading || wfLoading}
              error={metricsError ?? wfError}
              onRunSelect={(id) => handleRunSelect(id, 'monitor')}
              onWorkflowSelect={handleWorkflowSelect}
              onViewAllWorkflows={goWorkflows}
              onViewExecutions={(f) => goList(f ?? 'all')}
              onConnect={goConnect}
            />
          )}
          {view === 'workflows' && (
            <WorkflowsView
              workflows={wfList}
              total={wfListTotal}
              loading={wfListLoading}
              error={wfListError}
              search={search}
              health={wfHealth}
              sort={wfSort}
              page={wfPage}
              onSearchChange={setSearch}
              onHealthChange={setWfHealth}
              onSortChange={setWfSort}
              onPageChange={setWfPage}
              onWorkflowSelect={handleWorkflowSelect}
              onRunSelect={(id) => handleRunSelect(id, 'list')}
            />
          )}
          {view === 'agents' && (
            <AgentsView
              agents={agents}
              total={agentsTotal}
              uniqueAgents={agentsUnique}
              loading={agentsLoading}
              error={agentsError}
              search={search}
              page={agentPage}
              onSearchChange={setSearch}
              onPageChange={setAgentPage}
              onAgentSelect={handleAgentSelect}
              onAgentViewAllRuns={handleAgentViewAllRuns}
              onWorkflowSelect={handleWorkflowSelect}
            />
          )}
          {view === 'list' && (
            <RunsListView
              runs={runs}
              totalRuns={runsTotal}
              counts={counts}
              loading={runsLoading}
              error={runsError}
              filter={runFilter}
              search={search}
              workflowFilter={workflowFilter}
              agentFilter={agentFilter}
              page={execPage}
              onPageChange={setExecPage}
              onRunSelect={(id) => handleRunSelect(id, 'list')}
              onFilterChange={(f) => goList(f, { workflowId: workflowFilter, agentId: agentFilter })}
              onClearWorkflowFilter={handleClearWorkflowFilter}
              onViewAllAgents={goAgents}
            />
          )}
          {view === 'detail' && selectedRunId && (
            <RunDetailView runId={selectedRunId} tab={detailTab} onTabChange={setDetailTab} run={selectedRun} loading={detailLoading} error={detailError} />
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
      <FirstTimeOnboarding
        open={showOnboarding}
        variant={onboardingVariant}
        userName={user?.name ?? user?.email ?? 'there'}
        isAdmin={user?.role === 'admin'}
        onDismiss={dismissOnboarding}
        onGoToSettings={onboardingGoSettings}
        onGoToConnect={onboardingGoConnect}
      />
      </div>
    </AppShell>
  );
}

function OperatorApp() {
  const { user, loading: authLoading, authScreen, inviteToken, setAuthScreen } = useAuth();
  const authenticated = Boolean(user) || hasApiCredentials();

  if (authLoading) {
    return (
      <AppShell variant="auth">
        <div className="auth-page">
          <div style={{ color: 'var(--muL)' }}>Loading…</div>
        </div>
      </AppShell>
    );
  }

  if (!authenticated) {
    if (authScreen === 'register-tenant') {
      return (
        <RegisterTenantView onBack={() => { navigateTo('/'); setAuthScreen('login'); }} />
      );
    }
    if (authScreen === 'accept-invite' || inviteToken) return <AcceptInviteView />;
    return <LoginView onBack={() => navigateTo('/')} />;
  }

  return <AuthenticatedApp />;
}

export function App() {
  const isOperatorApp = useIsOperatorApp();

  if (!isOperatorApp) {
    return <LandingView />;
  }

  return (
    <AuthProvider>
      <OperatorApp />
    </AuthProvider>
  );
}
