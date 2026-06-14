import type { DriftType } from './types';

export interface LogisticModel {
  classes: DriftType[];
  weights: number[][];
  bias: number[];
}

export interface LinearRankerModel {
  weights: number[];
  bias: number;
}

export interface BlamrMlBundle {
  version: string;
  trained_at: string;
  drift_classifier: LogisticModel;
  ranker: LinearRankerModel;
  metrics?: {
    drift_accuracy?: number;
    ranker_top1?: number;
  };
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function dot(a: Float64Array | number[], w: number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += (a[i] ?? 0) * w[i];
  return s;
}

/** Multinomial logistic regression inference. */
export function predictDrift(
  model: LogisticModel,
  features: Float64Array,
): { label: DriftType; probs: Record<DriftType, number>; severity: number } {
  const logits = model.classes.map((_, ci) => dot(features, model.weights[ci] ?? []) + (model.bias[ci] ?? 0));
  const probsArr = softmax(logits);
  const probs = {} as Record<DriftType, number>;
  model.classes.forEach((c, i) => {
    probs[c] = probsArr[i] ?? 0;
  });

  let bestIdx = 0;
  let bestP = probsArr[0] ?? 0;
  for (let i = 1; i < probsArr.length; i++) {
    if ((probsArr[i] ?? 0) > bestP) {
      bestP = probsArr[i] ?? 0;
      bestIdx = i;
    }
  }

  const label = model.classes[bestIdx] ?? 'none';
  const severity =
    label === 'none'
      ? Math.max(0, 1 - (probs.none ?? 1))
      : Math.min(1, bestP * (1 + (features[6] ?? 0)));

  return { label, probs, severity };
}

/** Linear score for one agent; higher = more likely root cause. */
export function scoreAgent(model: LinearRankerModel, agentFeatures: Float64Array): number {
  return dot(agentFeatures, model.weights) + model.bias;
}

export function softmaxAgents(scores: Record<string, number>): Record<string, number> {
  const agents = Object.keys(scores);
  if (agents.length === 0) return {};
  const logits = agents.map((a) => scores[a] ?? 0);
  const probs = softmax(logits);
  const out: Record<string, number> = {};
  agents.forEach((a, i) => {
    out[a] = probs[i] ?? 0;
  });
  return out;
}

/** Drift severity → intent delta ceiling (more negative = more drift). */
export function severityToIntentDelta(severity: number, driftType: DriftType): number {
  if (driftType === 'none' || severity < 0.05) return -0.02;
  const base = -0.08 - severity * 0.55;
  if (driftType === 'domain_mismatch') return Math.max(-0.95, base - 0.15);
  if (driftType === 'retrieval_miss') return Math.max(-0.9, base - 0.1);
  if (driftType === 'severity_underrate') return Math.max(-0.85, base - 0.12);
  return Math.max(-0.8, base);
}

/** Drift severity → confidence ceiling. */
export function severityToConfidenceCeiling(severity: number, driftType: DriftType): number {
  if (driftType === 'none' || severity < 0.05) return 1;
  return Math.max(0.15, 1 - severity * (driftType === 'confidence_inflation' ? 0.35 : 0.65));
}
