import type { AgentBlame, BlameConfidence, BlameRole, CausalEdge, MastFailureMode } from '@blamr/types';
import { failureModeLabel } from '@blamr/types';

const INFLATION_THRESHOLD = 0.15;
const NULL_OUTPUT_FAULT_BOOST = 2.5;
const EMPTY_OUTPUT_FAULT_BOOST = 1.5;
const PARALLEL_SHIFT_RATIO = 0.25;

const CONTEXT_OVERFLOW_PATTERNS = [
  'context length', 'token limit', 'max tokens', 'context window',
  'maximum context', 'context_length_exceeded', 'too long',
];
const MISSING_TOOL_PATTERNS = [
  'no such tool', 'tool not found', 'function not found',
  'unknown function', 'undefined tool', 'tool_not_found',
];
const FORMAT_ERROR_PATTERNS = [
  'jsondecodeerror', 'invalid json', 'parse error', 'unmarshal',
  'deserializ', 'json decode', 'json parse', 'syntaxerror',
];
const RATE_LIMIT_PATTERNS = ['rate limit', 'ratelimit', 'too many requests', '429', 'quota exceeded'];

const EMPTY_OUTPUT_VALUES = new Set(['', 'null', 'none', '{}', '[]', 'undefined']);

export function isNullOutputPreview(preview?: string): boolean {
  return preview === undefined || preview === null as unknown as string;
}

export function isEmptyOutputPreview(preview?: string): boolean {
  if (preview === undefined) return false;
  const t = preview.trim().toLowerCase();
  return EMPTY_OUTPUT_VALUES.has(t);
}

export function hasBadInputPreview(preview?: string): boolean {
  if (!preview) return false;
  const t = preview.trim().toLowerCase();
  return EMPTY_OUTPUT_VALUES.has(t) || t.startsWith('error:');
}

export function edgeHasErrorOutput(preview?: string): boolean {
  if (!preview) return false;
  return preview.trim().toLowerCase().startsWith('error:');
}

export function introducedBadOutput(edge: CausalEdge): boolean {
  if (edgeHasErrorOutput(edge.output_preview)) return true;
  if (isNullOutputPreview(edge.output_preview)) return true;
  if (isEmptyOutputPreview(edge.output_preview)) return true;
  const intentHarm = Math.max(0, -edge.intent_delta);
  const confDrop = Math.max(0, edge.confidence_in - edge.confidence_out);
  return intentHarm >= 0.2 || confDrop >= 0.12;
}

export function nullOutputFaultBoost(edge: CausalEdge): number {
  let boost = 0;
  if (isNullOutputPreview(edge.output_preview)) boost += NULL_OUTPUT_FAULT_BOOST;
  else if (isEmptyOutputPreview(edge.output_preview)) boost += EMPTY_OUTPUT_FAULT_BOOST;
  if (edgeHasErrorOutput(edge.output_preview)) boost += 1.2;
  if (hasBadInputPreview(edge.input_preview) && !introducedBadOutput(edge)) {
    boost += 0.4;
  }
  return boost;
}

export function detectFailureMode(edge: CausalEdge): MastFailureMode | undefined {
  const blob = `${edge.output_preview ?? ''} ${edge.input_preview ?? ''}`.toLowerCase();

  if (CONTEXT_OVERFLOW_PATTERNS.some((p) => blob.includes(p))) {
    return 'system_design/context_overflow';
  }
  if (MISSING_TOOL_PATTERNS.some((p) => blob.includes(p))) {
    return 'system_design/missing_tool';
  }
  if (RATE_LIMIT_PATTERNS.some((p) => blob.includes(p))) {
    return 'system_design/rate_limit';
  }
  if (edge.call_type === 'Tool call' || edge.call_type === 'MCP call') {
    if (edgeHasErrorOutput(edge.output_preview)) return 'system_design/tool_failure';
  }
  if (FORMAT_ERROR_PATTERNS.some((p) => blob.includes(p))) {
    return 'inter_agent/wrong_output_format';
  }
  if (isNullOutputPreview(edge.output_preview) || isEmptyOutputPreview(edge.output_preview)) {
    return 'inter_agent/premature_termination';
  }
  if (hasBadInputPreview(edge.input_preview) && introducedBadOutput(edge) && !edgeHasErrorOutput(edge.output_preview)) {
    return 'inter_agent/bad_input_propagation';
  }
  if (edge.confidence_out - edge.confidence_in > INFLATION_THRESHOLD) {
    return 'inter_agent/confidence_inflation';
  }
  if (edge.intent_delta <= -0.2) {
    return 'inter_agent/intent_drift';
  }
  return undefined;
}

/** Sibling hops at the same hop_index — bad output on one poisons bad-input sibling. */
export function applyParallelPropagation(edges: CausalEdge[], weights: Map<string, number>): void {
  const byHop = new Map<number, CausalEdge[]>();
  for (const e of edges) {
    const list = byHop.get(e.hop_index) ?? [];
    list.push(e);
    byHop.set(e.hop_index, list);
  }

  for (const group of byHop.values()) {
    if (group.length < 2) continue;
    for (const target of group) {
      if (!hasBadInputPreview(target.input_preview)) continue;

      const targetAgent = target.to_agent;
      for (const sibling of group) {
        if (sibling.id === target.id) continue;
        if (!introducedBadOutput(sibling)) continue;

        const sourceAgent = sibling.to_agent;
        if (sourceAgent === targetAgent) continue;

        const shift = (weights.get(targetAgent) ?? 0) * PARALLEL_SHIFT_RATIO;
        if (shift <= 0) continue;
        weights.set(targetAgent, Math.max(0, (weights.get(targetAgent) ?? 0) - shift));
        weights.set(sourceAgent, (weights.get(sourceAgent) ?? 0) + shift);
      }
    }
  }
}

interface AgentContext {
  edge?: CausalEdge;
  selfBad: boolean;
  upstreamBad: boolean;
  isTerminal: boolean;
}

function buildAgentContext(agent: string, edges: CausalEdge[]): AgentContext {
  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);
  const edge = sorted.find((e) => e.from_agent === agent) ?? sorted.find((e) => e.to_agent === agent);
  const terminal = sorted.at(-1);
  const isTerminal = terminal
    ? terminal.to_agent === agent || terminal.from_agent === agent
    : false;

  const selfBad = edge ? introducedBadOutput(edge) : false;
  let upstreamBad = edge ? hasBadInputPreview(edge.input_preview) : false;

  if (edge?.source_hop_ids?.length) {
    const byId = new Map(edges.filter((e) => e.id).map((e) => [e.id, e]));
    for (const srcId of edge.source_hop_ids) {
      const src = byId.get(srcId);
      if (src && introducedBadOutput(src)) upstreamBad = true;
    }
  }

  const hopIdx = edge?.hop_index ?? -1;
  if (hopIdx > 0) {
    const prior = sorted.filter((e) => e.hop_index < hopIdx);
    const lastPrior = prior.at(-1);
    if (lastPrior && introducedBadOutput(lastPrior)) upstreamBad = true;
  }

  return { edge, selfBad, upstreamBad, isTerminal };
}

export function classifyBlameRole(
  agent: string,
  blamePct: number,
  isRoot: boolean,
  failed: boolean,
  ctx: AgentContext,
): BlameRole {
  if (!failed) {
    return blamePct >= 15 ? 'propagator' : 'clean';
  }
  if (blamePct < 5 && !ctx.selfBad) return 'clean';
  if (isRoot || (ctx.selfBad && !ctx.upstreamBad)) return 'originator';
  if (ctx.selfBad && ctx.upstreamBad && ctx.isTerminal) return 'manifestor';
  if (ctx.selfBad && ctx.upstreamBad) return 'propagator';
  if (ctx.upstreamBad) return 'propagator';
  return blamePct >= 10 ? 'propagator' : 'clean';
}

export function computeBlameConfidence(agents: AgentBlame[]): BlameConfidence {
  if (agents.length < 2) return 'high';
  const sorted = [...agents].sort((a, b) => b.blame_pct - a.blame_pct);
  const gap = sorted[0].blame_pct - (sorted[1]?.blame_pct ?? 0);
  if (gap >= 25) return 'high';
  if (gap >= 10) return 'medium';
  return 'ambiguous';
}

export function buildPropagationChain(agents: AgentBlame[], failed: boolean): string[] {
  if (!failed) return [];
  const chain: string[] = [];
  const originators = agents.filter((a) => a.role === 'originator');
  const manifestors = agents.filter((a) => a.role === 'manifestor');
  const propagators = agents.filter((a) => a.role === 'propagator' && a.blame_pct >= 8);

  if (originators.length === 0 && agents.length > 0) {
    const root = agents.find((a) => a.is_root) ?? agents[0];
    chain.push(`${root.agent} introduced the fault (${root.blame_pct}% blame)`);
  } else {
    for (const o of originators) {
      const mode = o.failure_mode ? ` — ${failureModeLabel(o.failure_mode)}` : '';
      chain.push(`${o.agent} originated bad state${mode}`);
    }
  }

  for (const p of propagators.slice(0, 3)) {
    chain.push(`${p.agent} → propagated upstream error`);
  }

  for (const m of manifestors) {
    chain.push(`${m.agent} manifested failure (visible endpoint)`);
  }

  return chain;
}

export function enrichReasonWithFailureMode(reason: string, mode?: MastFailureMode | string): string {
  if (!mode) return reason;
  const label = failureModeLabel(mode);
  if (reason.toLowerCase().includes(label.toLowerCase())) return reason;
  return `${reason} [${label}]`;
}

export function enrichAgentBlames(
  agents: AgentBlame[],
  edges: CausalEdge[],
  failed: boolean,
): { agents: AgentBlame[]; propagation_chain: string[]; blame_confidence: BlameConfidence } {
  const contexts = new Map(agents.map((a) => [a.agent, buildAgentContext(a.agent, edges)]));

  const enriched = agents.map((a) => {
    const ctx = contexts.get(a.agent)!;
    const role = classifyBlameRole(a.agent, a.blame_pct, a.is_root, failed, ctx);
    const failure_mode = ctx.edge ? detectFailureMode(ctx.edge) : undefined;
    return {
      ...a,
      role,
      ...(failure_mode ? { failure_mode } : {}),
      reason: enrichReasonWithFailureMode(a.reason, failure_mode),
    };
  });

  return {
    agents: enriched,
    propagation_chain: buildPropagationChain(enriched, failed),
    blame_confidence: computeBlameConfidence(enriched),
  };
}
