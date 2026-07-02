import type { CausalEdge } from '@blamr/types';

const UNCERTAINTY_PATTERNS = [
  'not sure',
  'uncertain',
  'maybe',
  'possibly',
  'insufficient',
  'not enough information',
  "don't know",
  'cannot determine',
  'need more information',
];

function hasPattern(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

export function enrichEdgeWithReasoningTrace(edge: CausalEdge): boolean {
  const reasoning = edge.reasoning_trace?.content?.trim();
  const output = edge.output_preview?.trim() ?? '';
  if (!reasoning) return false;

  let changed = false;
  const reasoningUncertain = hasPattern(reasoning, UNCERTAINTY_PATTERNS);
  const outputUncertain = output ? hasPattern(output, UNCERTAINTY_PATTERNS) : false;

  if (reasoningUncertain && !outputUncertain) {
    const nextConfidence = Math.min(edge.confidence_out, 0.45);
    if (nextConfidence !== edge.confidence_out) {
      edge.confidence_out = nextConfidence;
      changed = true;
    }
  }

  if (reasoningUncertain && output && !outputUncertain) {
    const nextIntent = Math.min(edge.intent_delta ?? 0, -0.45);
    if (nextIntent !== edge.intent_delta) {
      edge.intent_delta = nextIntent;
      changed = true;
    }
  }

  if (changed) edge.signal_source = 'reasoning';
  return changed;
}
