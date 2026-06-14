import { apiFetch } from './client';
import type { CausalEdge, AgentBlame, ConfidenceHop, IntentHop, WorkflowProfile } from '@blamr/types';
import { resolveWorkflowGate } from '@blamr/types';
import { buildRunDetail, mapApiRun, type RunDetail, type RunSummary } from '../types';

interface ListRunsResponse {
  runs: Record<string, unknown>[];
  total: number;
}

export async function fetchRuns(params?: {
  status?: string;
  workflow_id?: string;
  limit?: number;
}): Promise<{ runs: RunSummary[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.workflow_id) q.set('workflow_id', params.workflow_id);
  if (params?.limit) q.set('limit', String(params.limit));
  const suffix = q.toString() ? `?${q}` : '';
  const data = await apiFetch<ListRunsResponse>(`/v1/runs${suffix}`);
  return { runs: data.runs.map(mapApiRun), total: data.total };
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
  const settings = (workspace?.settings ?? {}) as { workflow_configs?: Record<string, WorkflowProfile> };
  const profile = resolveWorkflowGate(workflowId, settings).profile;

  return buildRunDetail(run, edges, blame, confidence, intent, profile);
}

export async function fetchKeys(): Promise<Record<string, unknown>[]> {
  return apiFetch<Record<string, unknown>[]>('/v1/keys');
}

export async function fetchWebhooks(): Promise<Record<string, unknown>[]> {
  return apiFetch<Record<string, unknown>[]>('/v1/webhooks');
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
