/** Hop-level drift taxonomy learned by the ML classifier. */
export type DriftType =
  | 'none'
  | 'domain_mismatch'
  | 'retrieval_miss'
  | 'severity_underrate'
  | 'confidence_inflation'
  | 'propagation'
  | 'format_error';

export const DRIFT_TYPES: DriftType[] = [
  'none',
  'domain_mismatch',
  'retrieval_miss',
  'severity_underrate',
  'confidence_inflation',
  'propagation',
  'format_error',
];

export interface HopDriftAnalysis {
  hop_index: number;
  agent: string;
  drift_type: DriftType;
  drift_score: number;
  confidence_ceiling: number;
  class_probs: Record<DriftType, number>;
  enrichment?: {
    semantic_intent_delta?: number;
    semantic_confidence_ceiling?: number;
    semantic_similarity?: number;
    ml_intent_delta?: number;
    ml_confidence_ceiling?: number;
  };
}

export interface MlFusionMeta {
  model_version: string;
  rule_weight: number;
  ml_weight: number;
  drift_model: string;
  ranker_model: string;
}

export interface RunMlAnalysis {
  hop_analysis: HopDriftAnalysis[];
  agent_fault_scores: Record<string, number>;
  fusion: MlFusionMeta;
}

export interface BlameMethod {
  method: 'ml_fusion' | 'backward_bfs_shapley' | 'rules_only';
}
