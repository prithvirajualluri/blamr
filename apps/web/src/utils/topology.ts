import type { RunLayout, TraceHop } from '@blamr/types';

export interface TopologyEdge {
  from: string;
  to: string;
  hop_index: number;
  influence: number;
}

export interface TopologyLayer {
  column: number;
  hop_index: number;
  agents: string[];
}

export interface WorkflowTopologyData {
  layout: RunLayout;
  layers: TopologyLayer[];
  edges: TopologyEdge[];
  agentColumns: Map<string, number>;
  hopCount: number;
  agentCount: number;
  maxParallelWidth: number;
}

export function layoutLabel(layout: RunLayout): string {
  if (layout === 'parallel') return 'Parallel';
  if (layout === 'dag') return 'DAG';
  return 'Linear';
}

export function layoutDescription(layout: RunLayout): string {
  if (layout === 'parallel') {
    return 'Multiple agents execute at the same hop before merging downstream.';
  }
  if (layout === 'dag') {
    return 'Fork/join or non-sequential hops — agents branch and reconverge.';
  }
  return 'Sequential pipeline — each hop hands off to the next agent.';
}

export function traceHopsToTopologyEdges(hops: TraceHop[]): TopologyEdge[] {
  return hops.map((h) => ({
    from: h.agent,
    to: h.to_agent,
    hop_index: h.hop_index,
    influence: h.influence_score,
  }));
}

/** Assign display columns from edge hop indices (supports parallel joins). */
export function computeAgentColumns(edges: TopologyEdge[]): Map<string, number> {
  const col = new Map<string, number>();
  if (!edges.length) return col;

  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index || a.from.localeCompare(b.from));

  for (const e of sorted) {
    const prevFrom = col.get(e.from);
    col.set(e.from, prevFrom === undefined ? e.hop_index : Math.min(prevFrom, e.hop_index));

    if (e.from === e.to) {
      col.set(e.to, Math.max(col.get(e.to) ?? 0, e.hop_index));
      continue;
    }

    const joinCount = edges.filter(
      (x) => x.hop_index === e.hop_index && x.to === e.to && x.from !== x.to,
    ).length;
    const toCol = joinCount > 1 ? e.hop_index + 1 : e.hop_index + 1;
    col.set(e.to, Math.max(col.get(e.to) ?? 0, toCol));
  }

  return col;
}

export function buildLayers(
  edges: TopologyEdge[],
  agentColumns: Map<string, number>,
  extraAgents: string[] = [],
): TopologyLayer[] {
  const byCol = new Map<number, Set<string>>();

  for (const [agent, column] of agentColumns) {
    const set = byCol.get(column) ?? new Set();
    set.add(agent);
    byCol.set(column, set);
  }

  for (const agent of extraAgents) {
    if (agentColumns.has(agent)) continue;
    const maxCol = byCol.size ? Math.max(...byCol.keys()) : 0;
    const set = byCol.get(maxCol) ?? new Set();
    set.add(agent);
    byCol.set(maxCol, set);
  }

  const hopByCol = new Map<number, number>();
  for (const e of edges) {
    const fromCol = agentColumns.get(e.from);
    if (fromCol !== undefined) {
      hopByCol.set(fromCol, Math.min(hopByCol.get(fromCol) ?? e.hop_index, e.hop_index));
    }
  }

  return [...byCol.entries()]
    .sort(([a], [b]) => a - b)
    .map(([column, agents]) => ({
      column,
      hop_index: hopByCol.get(column) ?? column,
      agents: [...agents].sort(),
    }));
}

export function inferLayoutFromEdges(edges: TopologyEdge[]): RunLayout {
  if (edges.length === 0) return 'linear';
  if (edges.length === 1) return 'linear';

  const byHop = new Map<number, Set<string>>();
  for (const e of edges) {
    const set = byHop.get(e.hop_index) ?? new Set();
    set.add(e.from);
    byHop.set(e.hop_index, set);
  }
  if ([...byHop.values()].some((s) => s.size > 1)) return 'parallel';

  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const e of edges) {
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
    if (e.to !== e.from) {
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    }
  }

  const hasFork = [...outDegree.values()].some((d) => d > 1);
  const hasJoin = [...inDegree.values()].some((d) => d > 1);
  if (hasFork || hasJoin) return 'dag';

  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);
  const strictLinear = sorted.every((e, i) => e.hop_index === i);
  return strictLinear ? 'linear' : 'dag';
}

export function buildWorkflowTopology(
  hops: TraceHop[],
  layoutHint?: RunLayout,
  allAgents: string[] = [],
): WorkflowTopologyData {
  const edges = traceHopsToTopologyEdges(hops);
  const layout = layoutHint ?? (edges.length ? inferLayoutFromEdges(edges) : 'linear');
  const agentColumns = computeAgentColumns(edges);
  const layers = buildLayers(edges, agentColumns, allAgents);
  const hopIndices = new Set(hops.map((h) => h.hop_index));
  const maxParallelWidth = Math.max(...layers.map((l) => l.agents.length), 1);
  const agentSet = new Set([...agentColumns.keys(), ...allAgents]);

  return {
    layout,
    layers,
    edges,
    agentColumns,
    hopCount: hopIndices.size,
    agentCount: agentSet.size,
    maxParallelWidth,
  };
}

export function computeNodePositions(
  layers: TopologyLayer[],
  width: number,
  height: number,
  padding = { x: 55, y: 36 },
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  if (!layers.length) return pos;

  const numCols = layers.length;
  const usableW = Math.max(width - padding.x * 2, 1);
  const nodeGap = 56;
  const maxInCol = Math.max(...layers.map((l) => l.agents.length), 1);
  const neededH = padding.y * 2 + maxInCol * nodeGap;
  const effectiveH = Math.max(height, neededH);

  layers.forEach((layer, colIdx) => {
    const x = numCols <= 1 ? width / 2 : padding.x + (colIdx / Math.max(numCols - 1, 1)) * usableW;
    const n = layer.agents.length;
    const colHeight = (n - 1) * nodeGap;
    const startY = effectiveH / 2 - colHeight / 2;
    layer.agents.forEach((agent, i) => {
      const y = n <= 1 ? effectiveH / 2 : startY + i * nodeGap;
      pos[agent] = { x, y };
    });
  });

  return pos;
}

/** Agents that only appear as edge targets (routing stubs) — hide from graph nodes. */
export function isVirtualGraphAgent(agent: string, hops: TraceHop[]): boolean {
  const asFrom = hops.some((h) => h.agent === agent);
  const asTo = hops.some((h) => h.to_agent === agent && h.agent !== agent);
  return asTo && !asFrom;
}

/** Hop-column layers for causal graph — one column per hop_index (executable agents only). */
export function buildGraphLayers(hops: TraceHop[]): TopologyLayer[] {
  if (!hops.length) return [];
  const byHop = new Map<number, Set<string>>();
  for (const h of hops) {
    if (isVirtualGraphAgent(h.agent, hops)) continue;
    const set = byHop.get(h.hop_index) ?? new Set();
    set.add(h.agent);
    byHop.set(h.hop_index, set);
  }
  return [...byHop.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hop_index, agents]) => ({
      column: hop_index,
      hop_index,
      agents: [...agents].sort(),
    }));
}

export interface GraphEdge {
  from: string;
  to: string;
  influence: number;
  hop_index: number;
}

/** Edges for SVG rendering — fans out through virtual targets, skips self-loops. */
export function buildGraphEdges(hops: TraceHop[], visibleAgents: Set<string>): GraphEdge[] {
  const result: GraphEdge[] = [];
  const seen = new Set<string>();

  const push = (from: string, to: string, influence: number, hop_index: number) => {
    if (from === to) return;
    if (!visibleAgents.has(from) || !visibleAgents.has(to)) return;
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ from, to, influence, hop_index });
  };

  for (const h of hops) {
    const from = h.agent;
    if (!visibleAgents.has(from)) continue;

    const to = h.to_agent;
    if (visibleAgents.has(to)) {
      push(from, to, h.influence_score, h.hop_index);
      continue;
    }

    // Virtual target (e.g. parallel_review) — fan out to agents on the next hop
    const downstream = hops.filter((x) => x.hop_index === h.hop_index + 1 && visibleAgents.has(x.agent));
    for (const d of downstream) {
      push(from, d.agent, h.influence_score, h.hop_index);
    }
  }

  return result;
}

export function graphHeightForLayers(layers: TopologyLayer[], min = 240): number {
  const maxInCol = Math.max(...layers.map((l) => l.agents.length), 1);
  return Math.max(min, 80 + maxInCol * 56);
}

export function shortAgentName(agent: string, max = 14): string {
  const lbl = agent.replace(/_agent$/, '').replace(/_/g, ' ');
  return lbl.length > max ? `${lbl.slice(0, max - 1)}…` : lbl;
}
