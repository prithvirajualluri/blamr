import type {
  AgentBlame,
  BlamrConnectionStatus,
  CausalEdge,
  Complexity,
  ConfidenceGateResult,
  ConfidenceHop,
  IntentHop,
  RunLayout,
  RunSpan,
  TraceHop,
  WorkflowProfile,
} from '@blamr/types';
import { computeBlamrStatus } from './utils/blamr-status';
import type { AgentConnectionRow } from './utils/blamr-status';

/** UI-facing run shape built from API responses (no local seed data). */
export interface RunDetail {
  id: string;
  title: string;
  workflow_id: string;
  status: 'success' | 'failed' | 'running';
  complexity: Complexity;
  error?: string;
  accuracy: number;
  total_tokens: number;
  total_cost_usd: number;
  total_ms: number;
  agents: string[];
  started_at: number;
  layout: RunLayout;
  spans: RunSpan[];
  trace_hops: TraceHop[];
  edges: Array<{
    from: string;
    to: string;
    influence: number;
    ci: number;
    co: number;
    inflated: boolean;
  }>;
  blame: Array<{
    agent: string;
    pct: number;
    root: boolean;
    reason: string;
    ml_pct?: number;
    drift_component?: string;
  }>;
  hop_analysis: Array<{
    hop_index: number;
    agent: string;
    drift_type: string;
    drift_score: number;
  }>;
  ml_fusion: {
    model_version: string;
    rule_weight: number;
    ml_weight: number;
  } | null;
  confidence_trace: ConfidenceHop[];
  intent_trace: IntentHop[];
  confidence_gate: ConfidenceGateResult | null;
  workflow_profile?: WorkflowProfile;
}

export interface RunSummary {
  id: string;
  title: string;
  workflow_id: string;
  status: 'success' | 'failed' | 'running';
  complexity: Complexity;
  error?: string;
  accuracy: number;
  total_tokens: number;
  total_cost_usd: number;
  total_ms: number;
  agents: string[];
  started_at: number;
  layout: RunLayout;
}

export interface WorkflowMonitorRow {
  id: string;
  name: string;
  runAccs: number[];
  avgAcc: number;
  totalRuns: number;
  failedRuns: number;
  successRuns: number;
  totalCostUsd: number;
  totalTokens: number;
  avgDurationMs: number;
  realRuns: string[];
  lastSeenAt: number;
  blamrStatus: BlamrConnectionStatus;
  agents: AgentConnectionRow[];
}

const INFLATION_THRESHOLD = 0.15;

export function inflationThresholdFromSettings(settings?: { confidence_inflation_threshold?: number }): number {
  const t = settings?.confidence_inflation_threshold;
  if (typeof t === 'number' && t > 0 && t <= 1) return t;
  return INFLATION_THRESHOLD;
}

export function mapApiRun(row: Record<string, unknown>): RunSummary {
  return {
    id: String(row.id),
    title: String(row.title ?? row.id),
    workflow_id: String(row.workflow_id),
    status: row.status as RunSummary['status'],
    complexity: (row.complexity as Complexity) ?? 'Simple',
    error: row.error_summary ? String(row.error_summary) : undefined,
    accuracy: Number(row.accuracy_score ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    total_cost_usd: Number(row.total_cost_usd ?? 0),
    total_ms: Number(row.duration_ms ?? 0),
    agents: Array.isArray(row.agents) ? (row.agents as string[]) : [],
    started_at: Number(row.started_at ?? 0),
    layout: (row.layout as RunLayout) ?? 'linear',
  };
}

function edgesToTraceHops(edges: CausalEdge[], hopMl?: Map<number, { drift_type: string; drift_score: number }>): TraceHop[] {
  return [...edges]
    .sort((a, b) => a.hop_index - b.hop_index)
    .map((e) => {
      const ml = hopMl?.get(e.hop_index);
      return {
        hop_index: e.hop_index,
        agent: e.from_agent,
        to_agent: e.to_agent,
        type: e.call_type,
        model: e.model,
        tokens_in: e.tokens_in,
        tokens_out: e.tokens_out,
        ms: e.latency_ms,
        cost: e.cost_usd,
        confidence_in: e.confidence_in,
        confidence_out: e.confidence_out,
        intent_delta: e.intent_delta,
        influence_score: e.influence_score,
        timestamp_ms: e.timestamp_ms,
        input_preview: e.input_preview || undefined,
        output_preview: e.output_preview || undefined,
        drift_type: ml?.drift_type as TraceHop['drift_type'],
        drift_score: ml?.drift_score,
      };
    });
}

function edgesToSpans(edges: CausalEdge[]): RunSpan[] {
  return edgesToTraceHops(edges).map((h) => ({
    agent: h.agent,
    type: h.type,
    model: h.model,
    tokens_in: h.tokens_in,
    tokens_out: h.tokens_out,
    ms: h.ms,
    cost: h.cost,
  }));
}

export function buildRunDetail(
  run: Record<string, unknown>,
  edges: CausalEdge[],
  blame: {
    agents: AgentBlame[];
    hop_analysis?: Array<{
      hop_index: number;
      agent: string;
      drift_type: string;
      drift_score: number;
    }>;
    ml_fusion?: { model_version: string; rule_weight: number; ml_weight: number } | null;
  } | null,
  confidence: { hops: ConfidenceHop[] } | null,
  intent: { hops: IntentHop[] } | null,
  workflowProfile?: WorkflowProfile,
  inflationThreshold?: number,
): RunDetail {
  const threshold = inflationThreshold ?? INFLATION_THRESHOLD;
  const summary = mapApiRun(run);
  const hopMl = new Map(
    (blame?.hop_analysis ?? []).map((h) => [h.hop_index, h]),
  );
  const graphEdges = edges.map((e) => ({
    from: e.from_agent,
    to: e.to_agent,
    influence: e.influence_score,
    ci: e.confidence_in,
    co: e.confidence_out,
    inflated: e.confidence_out - e.confidence_in > threshold,
  }));

  return {
    ...summary,
    layout: (run.layout as RunLayout) ?? 'linear',
    trace_hops: edgesToTraceHops(edges, hopMl),
    spans: edgesToSpans(edges),
    edges: graphEdges,
    blame: (blame?.agents ?? []).map((b) => ({
      agent: b.agent,
      pct: b.blame_pct,
      root: b.is_root,
      reason: b.reason,
      ml_pct: b.ml_blame_pct,
      drift_component: b.drift_component,
    })),
    hop_analysis: blame?.hop_analysis ?? [],
    ml_fusion: blame?.ml_fusion ?? null,
    confidence_trace: confidence?.hops ?? edges.map((e) => ({
      agent: e.from_agent,
      ci: e.confidence_in,
      co: e.confidence_out,
      inflated: e.confidence_out - e.confidence_in > threshold,
    })),
    intent_trace: intent?.hops ?? edges.map((e) => ({
      agent: e.from_agent,
      pct: Math.round(Math.max(0, Math.min(100, (1 + e.intent_delta) * 100))),
    })),
    confidence_gate: (run.confidence_gate as ConfidenceGateResult | null | undefined) ?? null,
    workflow_profile: workflowProfile,
  };
}

export function groupRunsByWorkflow(runs: RunSummary[]): WorkflowMonitorRow[] {
  const map = new Map<string, RunSummary[]>();
  for (const r of runs) {
    const list = map.get(r.workflow_id) ?? [];
    list.push(r);
    map.set(r.workflow_id, list);
  }
  return Array.from(map.entries()).map(([id, wfRuns]) => {
    const sorted = [...wfRuns].sort((a, b) => a.started_at - b.started_at);
    const accs = sorted.map((r) => r.accuracy);
    const lastSeenAt = Math.max(...wfRuns.map((r) => r.started_at), 0);
    const agentMap = new Map<string, number>();
    for (const r of wfRuns) {
      for (const agent of r.agents) {
        agentMap.set(agent, Math.max(agentMap.get(agent) ?? 0, r.started_at));
      }
    }
    const agents: AgentConnectionRow[] = Array.from(agentMap.entries())
      .map(([agentId, seenAt]) => ({
        id: agentId,
        workflowId: id,
        lastSeenAt: seenAt,
        blamrStatus: computeBlamrStatus(seenAt),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      id,
      name: id,
      runAccs: accs,
      avgAcc: accs.reduce((a, b) => a + b, 0) / (accs.length || 1),
      totalRuns: wfRuns.length,
      failedRuns: wfRuns.filter((r) => r.status === 'failed').length,
      successRuns: wfRuns.filter((r) => r.status === 'success').length,
      totalCostUsd: wfRuns.reduce((s, r) => s + r.total_cost_usd, 0),
      totalTokens: wfRuns.reduce((s, r) => s + r.total_tokens, 0),
      avgDurationMs: wfRuns.reduce((s, r) => s + r.total_ms, 0) / (wfRuns.length || 1),
      realRuns: sorted.map((r) => r.id),
      lastSeenAt,
      blamrStatus: computeBlamrStatus(lastSeenAt),
      agents,
    };
  });
}

export type View = 'monitor' | 'workflows' | 'agents' | 'list' | 'detail' | 'connect' | 'settings' | 'users';
export type RunFilter = 'all' | 'failed' | 'success';
export type HeatmapFilter = 'all' | 'critical' | 'warning' | 'fair' | 'healthy';
export type HeatmapSort = 'acc' | 'acc-d' | 'runs' | 'recent';
export type DetailSource = 'list' | 'monitor';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
