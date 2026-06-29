import type { CausalEdge, HopLlmReplayParentHop } from '@blamr/types';

const MAX_CONTEXT_HOPS = 8;
const MAX_PREVIEW_LEN = 500;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export function buildParentContext(
  edges: CausalEdge[],
  targetHop: CausalEdge,
): HopLlmReplayParentHop[] {
  const prior = [...edges]
    .filter((e) => e.hop_index < targetHop.hop_index)
    .sort((a, b) => a.hop_index - b.hop_index);

  const sourceIds = new Set(targetHop.source_hop_ids ?? []);
  const chain =
    sourceIds.size > 0
      ? prior.filter((e) => sourceIds.has(e.id))
      : prior.slice(-MAX_CONTEXT_HOPS);

  return chain.map((e) => ({
    hop_index: e.hop_index,
    agent: e.from_agent,
    call_type: e.call_type,
    output_preview: truncate(e.output_preview?.trim() ?? '', MAX_PREVIEW_LEN),
  }));
}

export function formatParentContextSystem(parentContext: HopLlmReplayParentHop[]): string {
  if (parentContext.length === 0) return '';
  const lines = ['[blamr replay] Upstream hop context from the original run:'];
  for (const hop of parentContext) {
    lines.push(
      `\n--- Hop ${hop.hop_index}: ${hop.agent} (${hop.call_type}) ---`,
    );
    if (hop.output_preview) lines.push(`Output: ${hop.output_preview}`);
  }
  lines.push('\n--- Replaying target hop below with this context ---');
  return lines.join('\n');
}
