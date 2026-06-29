import type { AgentBlame, BlameConfidence, CausalEdge, Complexity, ConfidenceGateResult } from '@blamr/types';
import { inferLayout } from '@blamr/types';
import {
  applyParallelPropagation,
  enrichAgentBlames,
  nullOutputFaultBoost,
} from './blame-enrichment';

const INFLATION_THRESHOLD = 0.15;
const RETRY_STORM_MIN_COUNT = 3;
const LINEAGE_SHIFT_RATIO = 0.35;

function fingerprintEdge(e: CausalEdge): string {
  const preview = (e.output_preview ?? '').slice(0, 64);
  return `${e.from_agent}|${e.to_agent}|${preview}|${e.confidence_out.toFixed(2)}`;
}

/** Collapse repeated identical hops (retry storms) — keep the first occurrence. */
export function collapseRetryStorms(edges: CausalEdge[]): CausalEdge[] {
  const groups = new Map<string, CausalEdge[]>();
  for (const e of edges) {
    const key = fingerprintEdge(e);
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  const kept: CausalEdge[] = [];
  for (const group of groups.values()) {
    if (group.length >= RETRY_STORM_MIN_COUNT) {
      kept.push(group[0]);
    } else {
      kept.push(...group);
    }
  }
  return kept.sort((a, b) => a.hop_index - b.hop_index);
}

/** Shift blame toward upstream hops proven by source_hop_ids lineage. */
export function applyLineageWeights(edges: CausalEdge[], weights: Map<string, number>): void {
  const byId = new Map(edges.filter((e) => e.id).map((e) => [e.id, e]));
  for (const e of edges) {
    if (!e.source_hop_ids?.length) continue;
    const fromWeight = weights.get(e.from_agent) ?? 0;
    if (fromWeight <= 0) continue;
    for (const srcId of e.source_hop_ids) {
      const src = byId.get(srcId);
      if (!src) continue;
      const shift = fromWeight * LINEAGE_SHIFT_RATIO;
      weights.set(e.from_agent, Math.max(0, (weights.get(e.from_agent) ?? 0) - shift));
      weights.set(src.from_agent, (weights.get(src.from_agent) ?? 0) + shift);
    }
  }
}

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
  propagation_chain?: string[];
  blame_confidence?: BlameConfidence;
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
    const nullBoost = failed ? nullOutputFaultBoost(e) : 0;
    const localFault = intentHarm * 3 + confDrop * 2 + inflation * 2 + nullBoost;
    const w = failed
      ? e.influence_score * (localFault + 0.05)
      : e.influence_score * 0.5;
    const faultAgent = e.from_agent === e.to_agent ? e.from_agent : e.to_agent;
    weights.set(faultAgent, (weights.get(faultAgent) ?? 0) + w);
    if (e.from_agent !== faultAgent) {
      weights.set(e.from_agent, (weights.get(e.from_agent) ?? 0) + w * 0.15);
    }
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
  const nullOut = edge && !edge.output_preview?.trim();
  const emptyOut = edge && ['null', 'none', '{}', '[]'].includes((edge.output_preview ?? '').trim().toLowerCase());

  if (!failed && pct < 20) return 'Agent performed within expected confidence bounds.';
  if (isRoot && failed) {
    if (nullOut || emptyOut) {
      return `${agent} produced null or empty output that poisoned downstream hops.`;
    }
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
  const sorted = [...collapseRetryStorms(edges)].sort((a, b) => a.hop_index - b.hop_index);
  const agents = orderedAgents(sorted);
  const started_at = sorted[0]?.timestamp_ms ?? Date.now();
  const ended_at = sorted.at(-1)?.timestamp_ms ?? started_at;
  const duration_ms = Math.max(0, ended_at - started_at);
  const total_tokens = sorted.reduce((s, e) => s + e.tokens_in + e.tokens_out, 0);
  const total_cost_usd = sorted.reduce((s, e) => s + e.cost_usd, 0);
  const failed = status === 'failed';
  const accuracy_score = computeAccuracy(sorted, status);
  const layout = inferLayout(sorted);

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
    layout,
    title: `${workflowId.replace(/-/g, ' ')} — ${runId.replace(/^run_/, '').slice(0, 8)}`,
  };

  const weights = blameWeights(sorted, failed);
  if (failed) {
    applyLineageWeights(sorted, weights);
    if (layout === 'parallel' || layout === 'dag') {
      applyParallelPropagation(sorted, weights);
    }
  }

  const total = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
  let agentBlames: AgentBlame[] = agents.map((agent) => {
    const raw = ((weights.get(agent) ?? 0) / total) * 100;
    const edge = sorted.find((e) => e.from_agent === agent) ?? sorted.find((e) => e.to_agent === agent);
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

  const enriched = enrichAgentBlames(agentBlames, sorted, failed);
  agentBlames = enriched.agents;

  const root = agentBlames[0] ?? { agent: agents[0] ?? 'unknown', blame_pct: 0 };

  return {
    run,
    report: {
      root_cause_agent: root.agent,
      root_cause_pct: root.blame_pct,
      method: 'backward_bfs_shapley',
      computed_at_ms: Date.now(),
      agents: agentBlames,
      propagation_chain: enriched.propagation_chain,
      blame_confidence: enriched.blame_confidence,
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
