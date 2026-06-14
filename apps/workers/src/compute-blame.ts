import type { AgentBlame, CausalEdge, Complexity, ConfidenceGateResult } from '@blamr/types';
import { inferLayout } from '@blamr/types';

const INFLATION_THRESHOLD = 0.15;

export interface ComputedRun {
  workflow_id: string;
  workspace_id: string;
  status: 'success' | 'failed';
  complexity: Complexity;
  started_at: number;
  ended_at: number;
  duration_ms: number;
  total_tokens: number;
  total_cost_usd: number;
  error_summary: string | null;
  accuracy_score: number;
  agents: string[];
  layout: 'linear' | 'parallel' | 'dag';
  title: string;
  confidence_gate?: ConfidenceGateResult | null;
}

export interface ComputedBlame {
  root_cause_agent: string;
  root_cause_pct: number;
  method: string;
  computed_at_ms: number;
  agents: AgentBlame[];
}

function orderedAgents(edges: CausalEdge[]): string[] {
  const agents: string[] = [];
  const seen = new Set<string>();
  for (const e of [...edges].sort((a, b) => a.hop_index - b.hop_index)) {
    if (!seen.has(e.from_agent)) {
      seen.add(e.from_agent);
      agents.push(e.from_agent);
    }
    if (!seen.has(e.to_agent)) {
      seen.add(e.to_agent);
      agents.push(e.to_agent);
    }
  }
  return agents;
}

function complexityFor(count: number): Complexity {
  if (count <= 2) return 'Simple';
  if (count <= 3) return 'Moderate';
  if (count <= 4) return 'Moderate+';
  if (count <= 6) return 'Complex';
  return 'Advanced';
}

function computeAccuracy(edges: CausalEdge[], status: 'success' | 'failed'): number {
  if (edges.length === 0) return status === 'success' ? 0.9 : 0.4;
  const last = [...edges].sort((a, b) => a.hop_index - b.hop_index).at(-1)!;
  const base = last.confidence_out;
  if (status === 'success') return Math.min(0.99, Math.max(0.65, base));
  return Math.min(0.65, Math.max(0.25, base * 0.55));
}

function faultSignals(edge: CausalEdge) {
  return {
    intentHarm: Math.max(0, -edge.intent_delta),
    confDrop: Math.max(0, edge.confidence_in - edge.confidence_out),
    inflation: Math.max(0, edge.confidence_out - edge.confidence_in - INFLATION_THRESHOLD),
  };
}

/** Weight blame by where fault was introduced, not hop order or raw influence. */
function blameWeights(edges: CausalEdge[], failed: boolean): Map<string, number> {
  const weights = new Map<string, number>();
  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);
  sorted.forEach((e) => {
    const { intentHarm, confDrop, inflation } = faultSignals(e);
    const localFault = intentHarm * 3 + confDrop * 2 + inflation * 2;
    const w = failed
      ? e.influence_score * (localFault + 0.05)
      : e.influence_score * 0.5;
    weights.set(e.from_agent, (weights.get(e.from_agent) ?? 0) + w);
  });
  if (weights.size === 0 && sorted.length > 0) {
    weights.set(sorted[0].from_agent, 1);
  }
  return weights;
}

function reasonFor(
  agent: string,
  pct: number,
  edge: CausalEdge | undefined,
  isRoot: boolean,
  failed: boolean,
): string {
  const { intentHarm, confDrop, inflation } = edge ? faultSignals(edge) : { intentHarm: 0, confDrop: 0, inflation: 0 };
  const performedCorrectly = intentHarm < 0.08 && confDrop < 0.05 && inflation === 0;

  if (!failed && pct < 20) return 'Agent performed within expected confidence bounds.';
  if (isRoot && failed) {
    if (intentHarm >= 0.2 && confDrop >= 0.05) {
      return `${agent} returned mismatched output — intent drift and confidence drop originated here.`;
    }
    if (intentHarm >= 0.2) {
      return `${agent} introduced intent drift by returning domain-mismatched data.`;
    }
    if (confDrop >= 0.05) {
      return `${agent} introduced a confidence drop signaling output mismatch.`;
    }
    if (inflation > 0) {
      return `${agent} showed confidence inflation — overstated certainty despite downstream failure.`;
    }
    return `${agent} contributed ${pct.toFixed(0)}% of causal blame as the primary fault source.`;
  }
  if (performedCorrectly && pct < 20) {
    return `${agent} executed correctly with stable confidence; minimal residual influence.`;
  }
  if (!failed && pct > 15) {
    return `${agent} carried ${pct.toFixed(0)}% of downstream causal influence on this successful run.`;
  }
  if (inflation > 0) return `${agent} showed confidence inflation across its hop.`;
  if (pct > 15) return `${agent} propagated upstream error with ${pct.toFixed(0)}% downstream influence.`;
  return `${agent} had minimal causal contribution (${pct.toFixed(0)}%).`;
}

export function computeFromEdges(
  runId: string,
  workflowId: string,
  workspaceId: string,
  status: 'success' | 'failed',
  errorSummary: string | null,
  edges: CausalEdge[],
): { run: ComputedRun; report: ComputedBlame } {
  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);
  const agents = orderedAgents(edges);
  const started_at = sorted[0]?.timestamp_ms ?? Date.now();
  const ended_at = sorted.at(-1)?.timestamp_ms ?? started_at;
  const duration_ms = Math.max(0, ended_at - started_at);
  const total_tokens = sorted.reduce((s, e) => s + e.tokens_in + e.tokens_out, 0);
  const total_cost_usd = sorted.reduce((s, e) => s + e.cost_usd, 0);
  const failed = status === 'failed';
  const accuracy_score = computeAccuracy(edges, status);

  const run: ComputedRun = {
    workflow_id: workflowId,
    workspace_id: workspaceId,
    status,
    complexity: complexityFor(agents.length),
    started_at,
    ended_at,
    duration_ms: duration_ms || sorted.reduce((s, e) => s + e.latency_ms, 0),
    total_tokens,
    total_cost_usd,
    error_summary: errorSummary,
    accuracy_score,
    agents,
    layout: inferLayout(edges),
    title: `${workflowId.replace(/-/g, ' ')} — ${runId.replace(/^run_/, '').slice(0, 8)}`,
  };

  const weights = blameWeights(edges, failed);
  const total = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
  const agentBlames: AgentBlame[] = agents.map((agent) => {
    const raw = ((weights.get(agent) ?? 0) / total) * 100;
    const edge = sorted.find((e) => e.from_agent === agent);
    const inflated = edge ? faultSignals(edge).inflation > 0 : false;
    return {
      agent,
      blame_pct: Math.round(raw * 10) / 10,
      is_root: false,
      reason: '',
      confidence_inflated: inflated,
    };
  });

  agentBlames.sort((a, b) => b.blame_pct - a.blame_pct);
  if (agentBlames.length > 0 && failed) agentBlames[0].is_root = true;
  for (const b of agentBlames) {
    const edge = sorted.find((e) => e.from_agent === b.agent);
    b.reason = reasonFor(b.agent, b.blame_pct, edge, b.is_root, failed);
  }

  const root = agentBlames[0] ?? { agent: agents[0] ?? 'unknown', blame_pct: 0 };

  return {
    run,
    report: {
      root_cause_agent: root.agent,
      root_cause_pct: root.blame_pct,
      method: 'backward_bfs_shapley',
      computed_at_ms: Date.now(),
      agents: agentBlames,
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
