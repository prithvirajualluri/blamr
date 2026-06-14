/**
 * Telemetry-first platform mode: agent-supplied intent_delta and confidence_out
 * are authoritative. Semantic + ML produce hints for blame/UI unless mutation enabled.
 */
export function isEdgeMutationEnabled(): boolean {
  const flag = process.env.BLAMR_MUTATE_EDGES?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

export function isTelemetryFirst(): boolean {
  return !isEdgeMutationEnabled();
}

/** Optional enrichment hints attached to hop analysis (never overwrite agent telemetry). */
export interface HopEnrichmentHints {
  semantic_intent_delta?: number;
  semantic_confidence_ceiling?: number;
  semantic_similarity?: number;
  ml_intent_delta?: number;
  ml_confidence_ceiling?: number;
}
