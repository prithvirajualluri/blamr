export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length !== a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0;
  return dot / denom;
}

export function similarityToIntentDelta(similarity: number): number {
  const clamped = Math.max(0, Math.min(1, similarity));
  return Math.max(-1, clamped - 1);
}

/** Map embedding similarity to max plausible confidence_out. */
export function similarityToConfidenceCeiling(similarity: number): number {
  return Math.max(0, Math.min(1, similarity));
}
