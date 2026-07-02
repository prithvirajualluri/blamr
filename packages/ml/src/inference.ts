import type { CausalEdge, WorkflowProfile } from '@blamr/types';
import { isEdgeMutationEnabled, resolveDomainType, intentHarmFromDelta } from '@blamr/types';
import type { DriftCache } from '@blamr/semantic';
import { embedTexts, normalizePreview } from '@blamr/semantic';
import type { DriftType, HopDriftAnalysis, RunMlAnalysis } from './types';
import { extractAgentFeatures, extractHopFeatures, embeddingSimilarities, AGENT_FEATURE_DIM } from './features';
import {
  predictDrift,
  scoreAgent,
  softmaxAgents,
  severityToConfidenceCeiling,
  severityToIntentDelta,
} from './math';
import { loadMlBundle } from './model-loader';
import { isMlEnabled, mlFusionAlpha, mlMinDriftConfidence } from './config';
import {
  categoriesAligned,
  expectsStructuredOutput,
  hasParseableJsonPreview,
  isIncidentWorkflow,
  isPlainTextPreview,
  outputHasHedging,
} from './preview-utils';

export type DriftPrediction = ReturnType<typeof predictDrift>;

export interface MlLogger {
  debug(message: string): void;
  warn(message: string): void;
}

export interface AnalyzeRunOptions {
  profile?: WorkflowProfile;
  semanticHints?: Map<number, { semanticDelta: number; ceiling: number; similarity: number }>;
  /** Workspace intent drift threshold — material drift when harm or ML severity exceeds this. */
  intentDriftThreshold?: number;
}

const noop: MlLogger = { debug: () => {}, warn: () => {} };

const DRIFT_PRIORITY: Record<DriftType, number> = {
  none: 0,
  format_error: 0.5,
  propagation: 1.5,
  confidence_inflation: 2.5,
  severity_underrate: 3.5,
  retrieval_miss: 4,
  domain_mismatch: 5,
};

function orderedAgents(edges: CausalEdge[]): string[] {
  const agents: string[] = [];
  const seen = new Set<string>();
  for (const e of [...edges].sort((a, b) => a.hop_index - b.hop_index)) {
    if (!seen.has(e.from_agent)) {
      seen.add(e.from_agent);
      agents.push(e.from_agent);
    }
  }
  return agents;
}

async function buildEmbeddingMap(
  edges: CausalEdge[],
  cache: DriftCache | null,
): Promise<Map<string, number[]>> {
  if (!cache) return new Map();
  const texts = new Set<string>();
  for (const e of edges) {
    const input = normalizePreview(e.input_preview);
    const output = normalizePreview(e.output_preview);
    if (input) texts.add(input);
    if (output) texts.add(output);
  }
  const runId = edges[0]?.run_id;
  if (runId) {
    const systemPrompt = normalizePreview((await cache.getRunSystemPrompt(runId)) ?? undefined);
    const goalSnapshot = normalizePreview((await cache.getRunGoalSnapshot(runId)) ?? undefined);
    if (systemPrompt) texts.add(systemPrompt);
    if (goalSnapshot) texts.add(goalSnapshot);
  }
  if (texts.size === 0) return new Map();
  try {
    return await embedTexts([...texts], cache);
  } catch {
    return new Map();
  }
}

/** Rule priors when scalar telemetry is unambiguous (production safety net). */
function applyRulePrior(
  features: Float64Array,
  pred: DriftPrediction,
  workflowId: string,
  profile?: WorkflowProfile,
  structuredContext?: boolean,
): DriftPrediction {
  const intentHarm = features[6] ?? 0;
  const inflation = features[5] ?? 0;
  const confDrop = features[4] ?? 0;
  const isTool = (features[12] ?? 0) > 0.5;
  const cosInOut = features[15] ?? 0.5;
  const domainType = resolveDomainType(workflowId, profile);
  const incident = isIncidentWorkflow(workflowId, domainType);

  if (structuredContext && intentHarm >= 0.28 && isTool) {
    const severity = Math.min(1, intentHarm * 1.15);
    return {
      label: 'domain_mismatch',
      severity,
      probs: { ...pred.probs, domain_mismatch: severity, none: 1 - severity },
    };
  }
  if (intentHarm >= 0.18 && isTool && cosInOut < 0.45) {
    return {
      label: 'retrieval_miss',
      severity: Math.min(1, intentHarm * 1.1),
      probs: { ...pred.probs, retrieval_miss: 0.75, none: 0.25 },
    };
  }

  const topProb = pred.probs[pred.label] ?? 0;
  if (topProb >= 0.72 && pred.label !== 'none') return pred;

  if (incident && intentHarm >= 0.22 && !isTool && confDrop >= 0.08) {
    return {
      label: 'severity_underrate',
      severity: Math.min(1, intentHarm),
      probs: { ...pred.probs, severity_underrate: 0.7, none: 0.3 },
    };
  }
  if (inflation > 0 && intentHarm >= 0.15) {
    return {
      label: 'confidence_inflation',
      severity: Math.min(1, intentHarm + inflation),
      probs: { ...pred.probs, confidence_inflation: 0.65, none: 0.35 },
    };
  }
  if (intentHarm >= 0.12 && pred.label === 'none') {
    return {
      label: 'propagation',
      severity: intentHarm,
      probs: { ...pred.probs, propagation: intentHarm, none: 1 - intentHarm },
    };
  }
  return pred;
}

/** Correct common ML false positives using hop previews and workflow context. */
function refineDriftPrediction(
  edge: CausalEdge,
  pred: DriftPrediction,
  workflowId: string,
  priorEdge: CausalEdge | undefined,
  profile: WorkflowProfile | undefined,
  cosGoalOut: number,
): DriftPrediction {
  let { label, severity } = pred;
  const domainType = resolveDomainType(workflowId, profile);
  const plainText = isPlainTextPreview(edge.output_preview);
  const structured = expectsStructuredOutput(priorEdge?.output_preview, edge.input_preview);

  if (label === 'format_error') {
    if (hasParseableJsonPreview(edge.output_preview) || plainText) {
      const embeddingDrift = cosGoalOut < 0.55 && edge.hop_index > 0;
      const remapped = embeddingDrift
        ? edge.call_type === 'Tool call' || edge.call_type === 'MCP call'
          ? 'retrieval_miss'
          : 'propagation'
        : 'none';
      return {
        label: remapped,
        severity: remapped === 'none' ? Math.min(severity, 0.08) : Math.min(severity, 0.5),
        probs: { ...pred.probs, [remapped]: remapped === 'none' ? 0.85 : severity, format_error: 0.05, none: remapped === 'none' ? 0.85 : 0.2 },
      };
    }
  }

  if (!isIncidentWorkflow(workflowId, domainType) && label === 'severity_underrate') {
    label = outputHasHedging(edge.output_preview) ? 'retrieval_miss' : 'propagation';
  }

  if (
    structured &&
    label === 'domain_mismatch' &&
    (edge.call_type === 'Tool call' || edge.call_type === 'MCP call') &&
    categoriesAligned(edge.input_preview, priorEdge?.output_preview)
  ) {
    label = 'retrieval_miss';
  }

  if (!structured && label === 'domain_mismatch' && plainText) {
    label = cosGoalOut < 0.5 ? 'retrieval_miss' : 'propagation';
  }

  if (label === pred.label) return pred;
  return {
    label,
    severity,
    probs: { ...pred.probs, [label]: Math.max(pred.probs[label] ?? 0, severity), none: 1 - severity },
  };
}

/**
 * Run production ML pipeline: hop drift classification + agent fault ranking.
 * In telemetry-first mode (default), stores enrichment hints without mutating edges.
 */
export async function analyzeRunWithMl(
  edges: CausalEdge[],
  cache: DriftCache | null,
  logger: MlLogger = noop,
  options: AnalyzeRunOptions = {},
): Promise<RunMlAnalysis | null> {
  if (!isMlEnabled() || edges.length === 0) return null;

  let bundle;
  try {
    bundle = loadMlBundle();
  } catch (err) {
    logger.warn(`ML bundle unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const mutate = isEdgeMutationEnabled();
  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);
  const driftThreshold = options.intentDriftThreshold ?? 0.2;
  const embeddings = await buildEmbeddingMap(sorted, cache);
  const runId = sorted[0]?.run_id;
  const systemPrompt = runId && cache
    ? normalizePreview((await cache.getRunSystemPrompt(runId)) ?? undefined)
    : null;
  const goalSnapshot = runId && cache
    ? normalizePreview((await cache.getRunGoalSnapshot(runId)) ?? undefined)
    : null;
  const goal = goalSnapshot ?? systemPrompt;
  const goalVec = goal ? embeddings.get(goal) : undefined;

  const hopAnalysis: HopDriftAnalysis[] = [];
  const hopDriftScores = new Map<number, number>();
  const hopIntentHarm = new Map<number, number>();
  const workflowId = sorted[0]?.workflow_id ?? '';

  for (const edge of sorted) {
    const priorEdge = sorted.find((e) => e.hop_index === edge.hop_index - 1);
    const input = normalizePreview(edge.input_preview);
    const output = normalizePreview(edge.output_preview);
    const inputVec = input ? embeddings.get(input) : undefined;
    const outputVec = output ? embeddings.get(output) : undefined;
    const { cosInOut, cosGoalOut } = embeddingSimilarities(inputVec, outputVec, goalVec);
    const structured = expectsStructuredOutput(priorEdge?.output_preview, edge.input_preview);

    const features = extractHopFeatures({
      edges: sorted,
      hopIndex: edge.hop_index,
      cosInOut,
      cosGoalOut,
    });

    let pred = applyRulePrior(
      features,
      predictDrift(bundle.drift_classifier, features),
      workflowId,
      options.profile,
      structured,
    );
    pred = refineDriftPrediction(edge, pred, workflowId, priorEdge, options.profile, cosGoalOut);
    const topProb = Math.max(...Object.values(pred.probs));
    const mlDelta = severityToIntentDelta(pred.severity, pred.label);
    const mlCeiling = severityToConfidenceCeiling(pred.severity, pred.label);
    const semanticHint = options.semanticHints?.get(edge.hop_index);

    const agentHarm = intentHarmFromDelta(edge.intent_delta);
    const materialDrift =
      pred.label !== 'none' &&
      (pred.severity >= driftThreshold || agentHarm >= driftThreshold);

    const shouldApply =
      topProb >= mlMinDriftConfidence() &&
      pred.label !== 'none' &&
      materialDrift &&
      !(edge.hop_index === 0 && pred.label === 'format_error') &&
      !(pred.label === 'format_error' && (hasParseableJsonPreview(edge.output_preview) || isPlainTextPreview(edge.output_preview)));

    if (shouldApply && mutate) {
      edge.intent_delta = Math.min(edge.intent_delta ?? 0, mlDelta);
      edge.confidence_out = Math.min(edge.confidence_out, mlCeiling);
    }

    if (shouldApply) {
      logger.debug(
        `ML hop ${edge.hop_index} ${edge.from_agent}: ${pred.label} (${topProb.toFixed(2)}) severity=${pred.severity.toFixed(2)}${mutate ? '' : ' [hint-only]'}`,
      );
    }

    const inferredHarm = shouldApply ? pred.severity : 0;
    hopDriftScores.set(edge.hop_index, pred.severity);
    hopIntentHarm.set(edge.hop_index, Math.max(agentHarm, inferredHarm * 0.85));

    hopAnalysis.push({
      hop_index: edge.hop_index,
      agent: edge.from_agent,
      drift_type: pred.label,
      drift_score: pred.severity,
      confidence_ceiling: mlCeiling,
      class_probs: pred.probs,
      enrichment: {
        ...(semanticHint
          ? {
              semantic_intent_delta: semanticHint.semanticDelta,
              semantic_confidence_ceiling: semanticHint.ceiling,
              semantic_similarity: semanticHint.similarity,
            }
          : {}),
        ml_intent_delta: mlDelta,
        ml_confidence_ceiling: mlCeiling,
      },
    });
  }

  const agents = orderedAgents(sorted);
  const agentScores: Record<string, number> = {};
  for (const agent of agents) agentScores[agent] = 0.001;

  const hasMaterialDrift = hopAnalysis.some(
    (h) => h.drift_type !== 'none' && h.drift_score >= driftThreshold,
  );

  for (const hop of hopAnalysis) {
    if (hop.drift_type === 'none' || hop.drift_score < 0.08) continue;
    // JSON classifier outputs often trigger format_error — deprioritize hop 0
    if (hop.hop_index === 0 && hop.drift_type === 'format_error') continue;
    const edge = sorted.find((e) => e.hop_index === hop.hop_index);
    const inf = edge?.influence_score ?? 0.5;
    const priority = DRIFT_PRIORITY[hop.drift_type] ?? 1;
    agentScores[hop.agent] =
      (agentScores[hop.agent] ?? 0) + hop.drift_score * inf * priority * (hasMaterialDrift ? 0.95 : 0.5);
  }

  const rankerWeight = hasMaterialDrift ? 0.12 : 0.45;
  for (const agent of agents) {
    const af = extractAgentFeatures(agent, sorted, hopDriftScores, hopIntentHarm);
    if (af.length !== AGENT_FEATURE_DIM) continue;
    agentScores[agent] = (agentScores[agent] ?? 0) + scoreAgent(bundle.ranker, af) * rankerWeight;
  }

  const agentFaultScores = softmaxAgents(agentScores);
  const alpha = mlFusionAlpha();

  return {
    hop_analysis: hopAnalysis,
    agent_fault_scores: agentFaultScores,
    fusion: {
      model_version: bundle.version,
      rule_weight: 1 - alpha,
      ml_weight: alpha,
      drift_model: 'logistic_regression',
      ranker_model: 'linear_softmax',
    },
  };
}
