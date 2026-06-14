export type { DriftType, HopDriftAnalysis, RunMlAnalysis, MlFusionMeta } from './types';
export { DRIFT_TYPES } from './types';
export { HOP_FEATURE_DIM, AGENT_FEATURE_DIM, extractHopFeatures, extractAgentFeatures } from './features';
export { isMlEnabled, mlFusionAlpha, mlMinDriftConfidence } from './config';
export { loadMlBundle, clearMlBundleCache } from './model-loader';
export { analyzeRunWithMl } from './inference';
export type { AnalyzeRunOptions, MlLogger } from './inference';
export { fuseBlameScores, attachHopAnalysisToReport, boostInfluenceFromMl } from './fusion';
