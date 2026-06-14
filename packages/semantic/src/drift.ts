import type { CausalEdge } from '@blamr/types';
import { isEdgeMutationEnabled } from '@blamr/types';
import type { DriftCache } from './cache';
import {
  cosineSimilarity,
  similarityToConfidenceCeiling,
  similarityToIntentDelta,
} from './cosine';
import { embedTexts, normalizePreview } from './embeddings';
import { isSemanticDriftEnabled } from './config';

export interface DriftLogger {
  debug(message: string): void;
  warn(message: string): void;
}

export interface SemanticDriftOptions {
  /** Harm threshold (0–1) — hints only emitted when semantic harm meets/exceeds this. */
  intentDriftThreshold?: number;
}

const noopLogger: DriftLogger = { debug: () => {}, warn: () => {} };

function applyDrift(
  edge: CausalEdge,
  input: string | null,
  output: string,
  goal: string | null,
  embeddings: Map<string, number[]>,
  mutate: boolean,
  intentDriftThreshold: number,
): { intentChanged: boolean; confidenceChanged: boolean; hints: { semanticDelta: number; ceiling: number; similarity: number } | null } {
  const outVec = embeddings.get(output);
  if (!outVec) return { intentChanged: false, confidenceChanged: false, hints: null };

  let semanticDelta = 0;
  let bestSimilarity = 1;
  let measured = false;
  const isToolHop = edge.call_type === 'Tool call' || edge.call_type === 'MCP call';

  if (isToolHop && input) {
    const inVec = embeddings.get(input);
    if (inVec) {
      const sim = cosineSimilarity(inVec, outVec);
      bestSimilarity = Math.min(bestSimilarity, sim);
      semanticDelta = Math.min(semanticDelta, similarityToIntentDelta(sim));
      measured = true;
    }
  }

  if (goal && goal !== output && edge.hop_index > 0) {
    const goalVec = embeddings.get(goal);
    if (goalVec) {
      const sim = cosineSimilarity(goalVec, outVec);
      bestSimilarity = Math.min(bestSimilarity, sim);
      semanticDelta = Math.min(semanticDelta, similarityToIntentDelta(sim));
      measured = true;
    }
  }

  if (!measured) return { intentChanged: false, confidenceChanged: false, hints: null };

  const semanticHarm = Math.max(0, -semanticDelta);
  if (semanticHarm < intentDriftThreshold) {
    return { intentChanged: false, confidenceChanged: false, hints: null };
  }

  const beforeDelta = edge.intent_delta ?? 0;
  const beforeConf = edge.confidence_out;
  const ceiling = similarityToConfidenceCeiling(bestSimilarity);

  if (mutate) {
    edge.intent_delta = Math.min(beforeDelta, semanticDelta);
    edge.confidence_out = Math.min(edge.confidence_out, ceiling);
  }

  return {
    intentChanged: mutate && edge.intent_delta !== beforeDelta,
    confidenceChanged: mutate && edge.confidence_out !== beforeConf,
    hints: { semanticDelta, ceiling, similarity: bestSimilarity },
  };
}

/** Enrich edges with semantic drift hints; mutates edges only when BLAMR_MUTATE_EDGES=1. */
export async function enrichEdgesWithSemanticDrift(
  edges: CausalEdge[],
  cache: DriftCache,
  logger: DriftLogger = noopLogger,
  options: SemanticDriftOptions = {},
): Promise<Map<number, { semanticDelta: number; ceiling: number; similarity: number }>> {
  const hintsByHop = new Map<number, { semanticDelta: number; ceiling: number; similarity: number }>();
  if (!isSemanticDriftEnabled() || edges.length === 0) return hintsByHop;

  const mutate = isEdgeMutationEnabled();
  const intentDriftThreshold = options.intentDriftThreshold ?? 0.2;

  const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);

  for (const edge of sorted) {
    const input = normalizePreview(edge.input_preview);
    if (input) {
      const goal = await cache.getRunGoal(edge.run_id);
      if (!goal) await cache.setRunGoal(edge.run_id, input);
    }
  }

  const uniqueTexts = new Set<string>();
  const plans: Array<{
    edge: CausalEdge;
    input: string | null;
    output: string;
    goal: string | null;
  }> = [];

  for (const edge of sorted) {
    const output = normalizePreview(edge.output_preview);
    if (!output) continue;

    const input = normalizePreview(edge.input_preview);
    const goal = await cache.getRunGoal(edge.run_id);

    if (input) uniqueTexts.add(input);
    uniqueTexts.add(output);
    if (goal) uniqueTexts.add(goal);

    plans.push({ edge, input, output, goal });
  }

  if (plans.length === 0) return hintsByHop;

  try {
    const embeddings = await embedTexts([...uniqueTexts], cache);
    for (const plan of plans) {
      const beforeDelta = plan.edge.intent_delta ?? 0;
      const beforeConf = plan.edge.confidence_out;
      const { intentChanged, confidenceChanged, hints } = applyDrift(
        plan.edge,
        plan.input,
        plan.output,
        plan.goal,
        embeddings,
        mutate,
        intentDriftThreshold,
      );
      if (hints) hintsByHop.set(plan.edge.hop_index, hints);
      if (intentChanged) {
        logger.debug(
          `run=${plan.edge.run_id} hop=${plan.edge.hop_index} intent_delta ${beforeDelta.toFixed(3)} → ${(plan.edge.intent_delta ?? 0).toFixed(3)}`,
        );
      }
      if (confidenceChanged) {
        logger.debug(
          `run=${plan.edge.run_id} hop=${plan.edge.hop_index} confidence_out ${beforeConf.toFixed(3)} → ${plan.edge.confidence_out.toFixed(3)}`,
        );
      } else if (hints && !mutate) {
        logger.debug(
          `run=${plan.edge.run_id} hop=${plan.edge.hop_index} semantic hint ceiling=${hints.ceiling.toFixed(3)} (telemetry-first)`,
        );
      }
    }
  } catch (err) {
    logger.warn(`Semantic drift skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
  return hintsByHop;
}
