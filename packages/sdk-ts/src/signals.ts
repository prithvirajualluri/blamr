import type { CallType } from '@blamr/types';
import {
  clamp01,
  extractConfidence,
  extractStructuredConfidence,
  tryParseJsonObject,
} from './confidence';

/** Max confidence allowed given intent drift (−1…0). */
export function alignmentCeiling(intentDelta: number): number {
  return clamp01(1 + intentDelta);
}

/** Map retrieval / relevance score (0–1) to intent delta. */
export function intentDeltaFromRelevance(relevance: number): number {
  const score = clamp01(relevance);
  if (score >= 0.75) return -0.02;
  if (score >= 0.5) return -0.08;
  if (score >= 0.35) return -0.15;
  return -0.35;
}

/** Map expected vs actual domain labels to intent delta (generic token overlap). */
export function intentDeltaFromAlignment(expected: string, actual: string): number {
  const expectedNorm = expected.toLowerCase().trim();
  const actualNorm = actual.toLowerCase().trim();
  if (!expectedNorm || !actualNorm) return -0.02;
  if (expectedNorm === actualNorm) return -0.02;
  if (expectedNorm.includes(actualNorm) || actualNorm.includes(expectedNorm)) return -0.02;

  const expectedTokens = new Set(expectedNorm.split(/[\s_\-./]+/).filter((t) => t.length > 2));
  const actualTokens = new Set(actualNorm.split(/[\s_\-./]+/).filter((t) => t.length > 2));
  if (expectedTokens.size === 0 || actualTokens.size === 0) return -0.12;

  let overlap = 0;
  for (const t of expectedTokens) {
    if (actualTokens.has(t)) overlap += 1;
  }
  const ratio = overlap / Math.max(expectedTokens.size, actualTokens.size);
  if (ratio >= 0.5) return -0.02;
  if (ratio >= 0.25) return -0.12;
  return -0.28;
}

export interface ConfidenceOutInput {
  text?: string;
  structured?: Record<string, unknown> | null;
  confidenceIn?: number;
  intentDelta?: number;
  toolScore?: number;
  callType?: CallType;
}

/** Composite confidence_out from lexical, structured, tool, and alignment signals. */
export function computeConfidenceOut(input: ConfidenceOutInput): number {
  const structured = input.structured ?? tryParseJsonObject(input.text);
  const candidates: number[] = [];

  if (input.text) candidates.push(extractConfidence(input.text));
  const fromStructured = extractStructuredConfidence(structured);
  if (fromStructured !== null) candidates.push(fromStructured);
  if (input.toolScore !== undefined) candidates.push(clamp01(input.toolScore));

  let value = candidates.length ? Math.min(...candidates) : 1.0;

  if (input.intentDelta !== undefined) {
    value = Math.min(value, alignmentCeiling(input.intentDelta));
  }

  if (input.confidenceIn !== undefined) {
    const drift = input.intentDelta ?? 0;
    const upstreamCap =
      drift < -0.1 ? input.confidenceIn * 0.92 : input.confidenceIn + 0.08;
    value = Math.min(value, upstreamCap);
  }

  if (input.callType === 'Tool call' || input.callType === 'MCP call') {
    value = Math.min(value, 0.96);
  }

  return clamp01(value);
}

export interface HopSignalsInput {
  text?: string;
  structured?: Record<string, unknown> | null;
  confidenceIn?: number;
  intentDelta?: number;
  toolScore?: number;
  callType?: CallType;
  expectedDomain?: string;
  actualDomain?: string;
  relevance?: number;
}

export interface HopSignals {
  confidence_out: number;
  intent_delta: number;
}

/** Compute paired confidence_out + intent_delta for a causal hop. */
export function computeHopSignals(input: HopSignalsInput): HopSignals {
  let intent_delta = input.intentDelta;
  if (intent_delta === undefined) {
    if (input.expectedDomain !== undefined && input.actualDomain !== undefined) {
      intent_delta = intentDeltaFromAlignment(input.expectedDomain, input.actualDomain);
    } else if (input.relevance !== undefined) {
      intent_delta = intentDeltaFromRelevance(input.relevance);
    } else {
      intent_delta = -0.02;
    }
  }

  const confidence_out = computeConfidenceOut({
    text: input.text,
    structured: input.structured,
    confidenceIn: input.confidenceIn,
    intentDelta: intent_delta,
    toolScore: input.toolScore ?? input.relevance,
    callType: input.callType,
  });

  return { confidence_out, intent_delta };
}
