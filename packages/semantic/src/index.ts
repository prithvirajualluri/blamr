export { cosineSimilarity, similarityToIntentDelta, similarityToConfidenceCeiling } from './cosine';
export type { DriftCache } from './cache';
export {
  isSemanticDriftEnabled,
  isLlmBlameReasonEnabled,
  semanticSettleMs,
} from './config';
export { isEdgeMutationEnabled, isTelemetryFirst } from '@blamr/types';
export { enrichEdgesWithSemanticDrift } from './drift';
export { enrichBlameReasonsWithLlm } from './llm-reasons';
export type { BlameReasonContext } from './llm-reasons';
export { embedTexts, normalizePreview } from './embeddings';
