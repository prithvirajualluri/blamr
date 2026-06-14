const HEDGE_MARKERS = [
  { pattern: /\bmight\b/gi, weight: 0.12 },
  { pattern: /\bpossibly\b/gi, weight: 0.16 },
  { pattern: /\buncertain\b/gi, weight: 0.2 },
  { pattern: /\bapproximately\b/gi, weight: 0.08 },
  { pattern: /\baround\b/gi, weight: 0.06 },
  { pattern: /\bcould be\b/gi, weight: 0.14 },
  { pattern: /\bunclear\b/gi, weight: 0.18 },
  { pattern: /\bperhaps\b/gi, weight: 0.12 },
  { pattern: /\bmaybe\b/gi, weight: 0.1 },
  { pattern: /\bprobably\b/gi, weight: 0.06 },
  { pattern: /\blikely\b/gi, weight: 0.04 },
  { pattern: /\bI think\b/gi, weight: 0.08 },
  { pattern: /\bI believe\b/gi, weight: 0.06 },
  { pattern: /\bnot sure\b/gi, weight: 0.18 },
  { pattern: /\bdon't know\b/gi, weight: 0.2 },
  { pattern: /\bcannot verify\b/gi, weight: 0.22 },
  { pattern: /\bdoes not match\b/gi, weight: 0.2 },
  { pattern: /\bdoesn't match\b/gi, weight: 0.2 },
  { pattern: /\bnot enough information\b/gi, weight: 0.18 },
  { pattern: /\binsufficient\b/gi, weight: 0.16 },
  { pattern: /\blimited evidence\b/gi, weight: 0.14 },
];

const MAX_HEDGE_PENALTY = 0.55;

/** Scan natural-language output for uncertainty markers. */
export function extractConfidence(text: string): number {
  let confidence = 1.0;
  let penalty = 0;
  for (const { pattern, weight } of HEDGE_MARKERS) {
    const matches = text.match(pattern);
    if (matches) penalty += weight * matches.length;
  }
  confidence -= Math.min(penalty, MAX_HEDGE_PENALTY);
  return clamp01(confidence);
}

/** Read explicit confidence from structured model output (JSON field). */
export function extractStructuredConfidence(
  structured?: Record<string, unknown> | null,
): number | null {
  if (!structured) return null;
  const raw =
    structured.confidence ??
    structured.certainty ??
    structured.confidence_score ??
    structured.score;
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
  return clamp01(raw > 1 ? raw / 100 : raw);
}

export function tryParseJsonObject(text?: string): Record<string, unknown> | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
