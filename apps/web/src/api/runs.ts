import { apiFetch } from './client';
import { getStoredToken } from '../auth/storage';
import { API_BASE } from '../types';
import type { CausalEdge, AgentBlame, ConfidenceHop, IntentHop, WorkflowProfile, BlamrConnectionStatus } from '@blamr/types';
import { resolveWorkflowGate } from '@blamr/types';
import { buildRunDetail, inflationThresholdFromSettings, mapApiRun, type RunDetail, type RunSummary } from '../types';

export interface RunStatusCounts {
  success: number;
  failed: number;
  running: number;
}

export interface PlatformOverview {
  executions: {
    total: number;
    success: number;
    failed: number;
    running: number;
    success_rate: number;
  };
  workflows: { total: number; critical: number; warning: number; fair: number; healthy: number };
  agents: { total: number };
  cost: { total_usd: number; avg_per_run: number };
  tokens: { total: number; avg_per_run: number };
  latency: { avg_ms: number };
  accuracy: { avg: number };
}

export interface IntegrationRecommendation {
  id: string;
  severity: 'warn' | 'critical';
  title: string;
  detail: string;
}

export interface WorkflowIntegrationHealth {
  level: 'healthy' | 'attention' | 'critical';
  recommendations: IntegrationRecommendation[];
  runs_analyzed: number;
  edges_analyzed: number;
}

export interface WorkflowApiRow {
  id: string;
  name: string;
  run_count: number;
  failed_runs: number;
  success_runs: number;
  avg_accuracy: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_duration_ms: number;
  last_run_at: number;
  blamr_status: BlamrConnectionStatus;
  agents: Array<{ agent_id: string; workflow_id: string; last_seen_at: number; blamr_status: BlamrConnectionStatus }>;
  integration_health: WorkflowIntegrationHealth;
}

export interface AgentApiRow {
  id: string;
  workflow_id: string;
  run_count: number;
  avg_run_accuracy: number;
  avg_hop_confidence: number | null;
  hop_index: number;
  hop_total: number;
  hop_role: string;
  last_seen_at: number;
  latest_run_id: string | null;
  blamr_status: BlamrConnectionStatus;
}

export interface AgentsListResponse {
  agents: AgentApiRow[];
  total: number;
  unique_agents: number;
}

interface ListRunsResponse {
  runs: Record<string, unknown>[];
  total: number;
  counts?: RunStatusCounts;
}

export async function fetchRuns(params?: {
  status?: string;
  workflow_id?: string;
  agent_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ runs: RunSummary[]; total: number; counts: RunStatusCounts }> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.workflow_id) q.set('workflow_id', params.workflow_id);
  if (params?.agent_id) q.set('agent_id', params.agent_id);
  if (params?.q) q.set('q', params.q);
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  const suffix = q.toString() ? `?${q}` : '';
  const data = await apiFetch<ListRunsResponse>(`/v1/runs${suffix}`);
  return {
    runs: data.runs.map(mapApiRun),
    total: data.total,
    counts: data.counts ?? { success: 0, failed: 0, running: 0 },
  };
}

export async function fetchMetricsOverview(): Promise<PlatformOverview> {
  return apiFetch<PlatformOverview>('/v1/metrics/overview');
}

export async function fetchWorkflowsApi(params?: {
  limit?: number;
  offset?: number;
  q?: string;
  health?: string;
  sort?: string;
}): Promise<{ workflows: WorkflowApiRow[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  if (params?.q) q.set('q', params.q);
  if (params?.health && params.health !== 'all') q.set('health', params.health);
  if (params?.sort) q.set('sort', params.sort);
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch(`/v1/workflows${suffix}`);
}

export async function fetchAgentsApi(params?: {
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<AgentsListResponse> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  if (params?.q) q.set('q', params.q);
  const suffix = q.toString() ? `?${q}` : '';
  return apiFetch(`/v1/agents${suffix}`);
}

export async function fetchWorkflowAccuracyHistory(workflowId: string): Promise<Array<{ run_id: string; accuracy: number; timestamp: number }>> {
  const data = await apiFetch<{ runs: Array<{ run_id: string; accuracy: number; timestamp: number }> }>(
    `/v1/workflows/${encodeURIComponent(workflowId)}/accuracy-history`,
  );
  return data.runs;
}

export async function fetchRunDetail(id: string): Promise<RunDetail> {
  const run = await apiFetch<Record<string, unknown> & { edges: CausalEdge[] }>(`/v1/runs/${id}`);
  const edges = run.edges ?? [];

  const [blame, confidence, intent, workspace] = await Promise.all([
    apiFetch<{
      agents: AgentBlame[];
      hop_analysis?: RunDetail['hop_analysis'];
      ml_fusion?: RunDetail['ml_fusion'];
    }>(`/v1/runs/${id}/blame`).catch(() => null),
    apiFetch<{ hops: ConfidenceHop[] }>(`/v1/runs/${id}/confidence-trace`).catch(() => null),
    apiFetch<{ hops: IntentHop[] }>(`/v1/runs/${id}/intent-trace`).catch(() => null),
    fetchWorkspace().catch(() => null),
  ]);

  const workflowId = String(run.workflow_id ?? '');
  const settings = (workspace?.settings ?? {}) as {
    workflow_configs?: Record<string, WorkflowProfile>;
    confidence_inflation_threshold?: number;
  };
  const profile = resolveWorkflowGate(workflowId, settings).profile;
  const inflationThreshold = inflationThresholdFromSettings(settings);

  return buildRunDetail(run, edges, blame, confidence, intent, profile, inflationThreshold);
}

export async function exportRunNdjson(runId: string): Promise<void> {
  const token = getStoredToken();
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/v1/runs/${encodeURIComponent(runId)}/export?format=eu-ai-act`, { headers });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${runId}-audit.ndjson`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchKeys(): Promise<Record<string, unknown>[]> {
  return apiFetch<Record<string, unknown>[]>('/v1/keys');
}

export async function fetchWebhooks(): Promise<Record<string, unknown>[]> {
  return apiFetch<Record<string, unknown>[]>('/v1/webhooks');
}

export async function createWebhook(body: {
  name: string;
  url: string;
  events: string[];
  secret: string;
}): Promise<Record<string, unknown>> {
  return apiFetch('/v1/webhooks', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiFetch(`/v1/webhooks/${id}`, { method: 'DELETE' });
}

export async function testWebhook(id: string): Promise<Record<string, unknown>> {
  return apiFetch(`/v1/webhooks/${id}/test`, { method: 'POST' });
}

export async function patchWorkspaceSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/v1/workspace', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function fetchWorkspace(): Promise<Record<string, unknown> | null> {
  return apiFetch<Record<string, unknown>>('/v1/workspace').catch(() => null);
}

export async function createKey(body: {
  name: string;
  environment: 'live' | 'test';
  scopes: string[];
}): Promise<{ key: Record<string, unknown>; raw_key: string }> {
  return apiFetch('/v1/keys', { method: 'POST', body: JSON.stringify(body) });
}

export async function revokeKey(id: string): Promise<void> {
  await apiFetch(`/v1/keys/${id}`, { method: 'DELETE' });
}
