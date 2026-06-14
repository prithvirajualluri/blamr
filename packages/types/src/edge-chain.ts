import type { CausalEdge } from './models';

/** Intent harm on a hop: 0 = fully preserved, 1 = total drift. */
export function intentHarmFromDelta(intentDelta: number | undefined | null): number {
  return Math.max(0, -(intentDelta ?? 0));
}

/**
 * Reconcile confidence_in from upstream topology (supports parallel fork/join).
 * Hop 0 edges keep agent-emitted confidence_in.
 */
export function reconcileEdgeConfidenceChain(edges: CausalEdge[]): void {
  if (edges.length === 0) return;

  const sorted = [...edges].sort(
    (a, b) => a.hop_index - b.hop_index || a.from_agent.localeCompare(b.from_agent),
  );

  const byHop = new Map<number, CausalEdge[]>();
  for (const e of sorted) {
    const list = byHop.get(e.hop_index) ?? [];
    list.push(e);
    byHop.set(e.hop_index, list);
  }

  const hops = [...byHop.keys()].sort((a, b) => a - b);

  for (let i = 1; i < hops.length; i++) {
    const hop = hops[i];
    const hopEdges = byHop.get(hop)!;
    const prevHop = hops[i - 1];
    const prevEdges = byHop.get(prevHop)!;

    for (const edge of hopEdges) {
      // Join: predecessors at any prior hop targeting this agent
      const directPreds = sorted.filter(
        (p) => p.to_agent === edge.from_agent && p.hop_index < edge.hop_index,
      );
      if (directPreds.length > 0) {
        edge.confidence_in = Math.min(...directPreds.map((p) => p.confidence_out));
        continue;
      }

      // Parallel fork: multiple agents at this hop share upstream from previous hop
      if (hopEdges.length > 1 && prevEdges.length >= 1) {
        edge.confidence_in =
          prevEdges.length === 1
            ? prevEdges[0].confidence_out
            : Math.min(...prevEdges.map((p) => p.confidence_out));
        continue;
      }

      // Linear: single predecessor chain
      if (prevEdges.length === 1 && hopEdges.length === 1) {
        edge.confidence_in = prevEdges[0].confidence_out;
      }
    }
  }
}

/** True when preview text contains parseable JSON object. */
export function hasParseableJsonPreview(preview?: string | null): boolean {
  if (!preview) return false;
  const match = preview.match(/\{[\s\S]*\}/);
  if (!match) return false;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function isIncidentWorkflow(workflowId?: string | null): boolean {
  if (!workflowId) return false;
  const id = workflowId.toLowerCase();
  return id.includes('incident') || id.includes('triage') || id.includes('alert');
}

export function categoriesAligned(inputPreview?: string, priorOutputPreview?: string): boolean {
  const priorJson = extractJsonField(priorOutputPreview, 'category', 'intent', 'domain');
  if (!priorJson || !inputPreview) return false;
  return inputPreview.toLowerCase().includes(priorJson.toLowerCase());
}

function extractJsonField(preview: string | undefined, ...keys: string[]): string | undefined {
  if (!preview) return undefined;
  const match = preview.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    for (const key of keys) {
      const v = obj[key];
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}
