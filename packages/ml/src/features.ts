import type { CausalEdge } from '@blamr/types';
import { cosineSimilarity } from '@blamr/semantic';

/** Fixed hop feature dimension — must match training pipeline. */
export const HOP_FEATURE_DIM = 24;

const INFLATION_THRESHOLD = 0.15;

export interface HopFeatureContext {
  edges: CausalEdge[];
  hopIndex: number;
  cosInOut?: number;
  cosGoalOut?: number;
}

function callTypeOneHot(callType: string): [number, number, number, number] {
  const t = callType.toLowerCase();
  if (t.includes('tool')) return [0, 1, 0, 0];
  if (t.includes('mcp')) return [0, 0, 1, 0];
  if (t.includes('vision')) return [0, 0, 0, 1];
  return [1, 0, 0, 0];
}

function logNorm(value: number, scale: number): number {
  return Math.log1p(Math.max(0, value)) / scale;
}

/** Build a fixed-size feature vector for one causal hop. */
export function extractHopFeatures(ctx: HopFeatureContext): Float64Array {
  const sorted = [...ctx.edges].sort((a, b) => a.hop_index - b.hop_index);
  const edge = sorted.find((e) => e.hop_index === ctx.hopIndex);
  if (!edge) return new Float64Array(HOP_FEATURE_DIM);

  const n = sorted.length;
  const idx = sorted.findIndex((e) => e.hop_index === ctx.hopIndex);
  const prev = idx > 0 ? sorted[idx - 1] : null;

  const confDrop = Math.max(0, edge.confidence_in - edge.confidence_out);
  const inflation = Math.max(0, edge.confidence_out - edge.confidence_in - INFLATION_THRESHOLD);
  const intentHarm = Math.max(0, -edge.intent_delta);
  const tokens = edge.tokens_in + edge.tokens_out;

  const prevIntentHarm = prev ? Math.max(0, -prev.intent_delta) : 0;
  const prevConfDrop = prev ? Math.max(0, prev.confidence_in - prev.confidence_out) : 0;

  const cosInOut = ctx.cosInOut ?? 0.5;
  const cosGoalOut = ctx.cosGoalOut ?? 0.5;

  const vec = new Float64Array(HOP_FEATURE_DIM);
  vec[0] = edge.confidence_in;
  vec[1] = edge.confidence_out;
  vec[2] = edge.intent_delta;
  vec[3] = edge.influence_score;
  vec[4] = confDrop;
  vec[5] = inflation;
  vec[6] = intentHarm;
  vec[7] = n > 1 ? idx / (n - 1) : 0;
  vec[8] = logNorm(tokens, 10);
  vec[9] = logNorm(edge.latency_ms, 10);
  vec[10] = logNorm(edge.cost_usd * 1000, 5);
  const [llm, tool, mcp, vision] = callTypeOneHot(edge.call_type);
  vec[11] = llm;
  vec[12] = tool;
  vec[13] = mcp;
  vec[14] = vision;
  vec[15] = cosInOut;
  vec[16] = cosGoalOut;
  vec[17] = edge.input_preview?.trim() ? 1 : 0;
  vec[18] = edge.output_preview?.trim() ? 1 : 0;
  vec[19] = idx === 0 ? 1 : 0;
  vec[20] = idx === n - 1 ? 1 : 0;
  vec[21] = prevIntentHarm;
  vec[22] = prevConfDrop;
  vec[23] = edge.confidence_out * edge.influence_score;

  return vec;
}

/** Cosine similarities for embedding-enriched features. */
export function embeddingSimilarities(
  inputVec: number[] | undefined,
  outputVec: number[] | undefined,
  goalVec: number[] | undefined,
): { cosInOut: number; cosGoalOut: number } {
  let cosInOut = 0.5;
  let cosGoalOut = 0.5;
  if (inputVec && outputVec) cosInOut = cosineSimilarity(inputVec, outputVec);
  if (goalVec && outputVec) cosGoalOut = cosineSimilarity(goalVec, outputVec);
  return { cosInOut, cosGoalOut };
}

export const AGENT_FEATURE_DIM = 8;

/** Per-agent features aggregated from hop-level ML outputs for ranker. */
export function extractAgentFeatures(
  agent: string,
  edges: CausalEdge[],
  hopDriftScores: Map<number, number>,
  hopIntentHarm: Map<number, number>,
): Float64Array {
  const fromHops = edges.filter((e) => e.from_agent === agent);
  const vec = new Float64Array(AGENT_FEATURE_DIM);

  if (fromHops.length === 0) return vec;

  let maxDrift = 0;
  let sumDriftInfluence = 0;
  let maxIntentHarm = 0;
  let maxConfDrop = 0;
  let inflationFlag = 0;
  let sumInfluence = 0;

  for (const e of fromHops) {
    const drift = hopDriftScores.get(e.hop_index) ?? 0;
    const harm = hopIntentHarm.get(e.hop_index) ?? Math.max(0, -e.intent_delta);
    maxDrift = Math.max(maxDrift, drift);
    sumDriftInfluence += drift * e.influence_score;
    maxIntentHarm = Math.max(maxIntentHarm, harm);
    maxConfDrop = Math.max(maxConfDrop, Math.max(0, e.confidence_in - e.confidence_out));
    if (e.confidence_out - e.confidence_in > INFLATION_THRESHOLD) inflationFlag = 1;
    sumInfluence += e.influence_score;
  }

  vec[0] = maxDrift;
  vec[1] = sumDriftInfluence;
  vec[2] = maxIntentHarm;
  vec[3] = maxConfDrop;
  vec[4] = inflationFlag;
  vec[5] = fromHops.length / Math.max(edges.length, 1);
  vec[6] = sumInfluence / fromHops.length;
  vec[7] = fromHops[0]?.hop_index === Math.min(...edges.map((e) => e.hop_index)) ? 1 : 0;

  return vec;
}
