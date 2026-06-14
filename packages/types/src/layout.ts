import type { CausalEdge, RunLayout } from './models';

/** Infer graph layout from edge topology (no workflow definition required). */
export function inferLayout(edges: CausalEdge[]): RunLayout {
  if (edges.length === 0) return 'linear';
  if (edges.length === 1) return 'linear';

  const byHop = new Map<number, Set<string>>();
  for (const e of edges) {
    const set = byHop.get(e.hop_index) ?? new Set();
    set.add(e.from_agent);
    byHop.set(e.hop_index, set);
  }
  if ([...byHop.values()].some((s) => s.size > 1)) return 'parallel';

  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const e of edges) {
    outDegree.set(e.from_agent, (outDegree.get(e.from_agent) ?? 0) + 1);
    if (e.to_agent !== e.from_agent) {
      inDegree.set(e.to_agent, (inDegree.get(e.to_agent) ?? 0) + 1);
    }
  }

  const hasFork = [...outDegree.values()].some((d) => d > 1);
  const hasJoin = [...inDegree.values()].some((d) => d > 1);
  if (hasFork || hasJoin) return 'dag';

  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);
  const strictLinear = sorted.every((e, i) => e.hop_index === i);
  return strictLinear ? 'linear' : 'dag';
}
