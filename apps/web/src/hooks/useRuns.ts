import { useCallback, useEffect, useState } from 'react';
import {
  fetchMetricsOverview,
  fetchRuns,
  fetchWorkflowsApi,
  fetchAgentsApi,
  type PlatformOverview,
  type RunStatusCounts,
  type WorkflowApiRow,
  type AgentApiRow,
} from '../api/runs';
import { fetchRunDetail } from '../api/runs';
import { ApiError } from '../api/client';
import type { RunDetail, RunSummary } from '../types';

export function useMetricsOverview(refreshKey = 0, enabled = true) {
  const [metrics, setMetrics] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setMetrics(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMetrics(await fetchMetricsOverview());
    } catch (e) {
      setMetrics(null);
      setError(e instanceof ApiError ? e.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { metrics, loading, error, reload };
}

export function usePaginatedRuns(
  params: {
    status?: string;
    workflow_id?: string;
    agent_id?: string;
    q?: string;
    limit?: number;
    offset?: number;
  },
  refreshKey = 0,
  enabled = true,
) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<RunStatusCounts>({ success: 0, failed: 0, running: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setRuns([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRuns(params);
      setRuns(data.runs);
      setTotal(data.total);
      setCounts(data.counts);
    } catch (e) {
      setRuns([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [enabled, params.status, params.workflow_id, params.agent_id, params.q, params.limit, params.offset]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { runs, total, counts, loading, error, reload };
}

export function useWorkflowsList(
  params: { q?: string; health?: string; sort?: string; limit?: number; offset?: number },
  refreshKey = 0,
  enabled = true,
) {
  const [workflows, setWorkflows] = useState<WorkflowApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setWorkflows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflowsApi(params);
      setWorkflows(data.workflows);
      setTotal(data.total);
    } catch (e) {
      setWorkflows([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [enabled, params.q, params.health, params.sort, params.limit, params.offset]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { workflows, total, loading, error, reload };
}

export function useAgentsList(
  params: { q?: string; limit?: number; offset?: number },
  refreshKey = 0,
  enabled = true,
) {
  const [agents, setAgents] = useState<AgentApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueAgents, setUniqueAgents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setAgents([]);
      setTotal(0);
      setUniqueAgents(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgentsApi(params);
      setAgents(data.agents);
      setTotal(data.total);
      setUniqueAgents(data.unique_agents ?? data.agents.length);
    } catch (e) {
      setAgents([]);
      setTotal(0);
      setUniqueAgents(0);
      setError(e instanceof ApiError ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [enabled, params.q, params.limit, params.offset]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { agents, total, uniqueAgents, loading, error, reload };
}

export function useRunDetail(runId: string | null, enabled = true) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !enabled) {
      setRun(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRunDetail(runId)
      .then((data) => { if (!cancelled) setRun(data); })
      .catch((e) => {
        if (!cancelled) {
          setRun(null);
          setError(e instanceof ApiError ? e.message : 'Failed to load run');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId, enabled]);

  return { run, loading, error };
}

/** @deprecated use usePaginatedRuns or useMetricsOverview */
export function useRuns(refreshKey = 0, enabled = true) {
  return usePaginatedRuns({ limit: 50, offset: 0 }, refreshKey, enabled);
}
