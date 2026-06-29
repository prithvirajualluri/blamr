import type { HopReplayStatus } from '@blamr/types';

export function computeReplayStatus(
  originalOutput: string | null,
  newOutput: string | null,
  originalError: string | null,
  newError: string | null,
): HopReplayStatus {
  const origHadError = Boolean(originalError?.trim());
  const newHasError = Boolean(newError?.trim());

  if (newHasError && !origHadError) return 'degraded';
  if (origHadError && !newHasError && newOutput?.trim()) return 'improved';

  const orig = (originalOutput ?? '').trim();
  const next = (newOutput ?? '').trim();
  if (orig === next) return 'same';
  return 'different';
}

export function computeLineDiff(original: string | null, updated: string | null): string[] {
  const a = (original ?? '').split('\n');
  const b = (updated ?? '').split('\n');
  const diff: string[] = [];
  const maxLen = Math.max(a.length, b.length);

  for (let i = 0; i < maxLen; i += 1) {
    const left = a[i] ?? '';
    const right = b[i] ?? '';
    if (left === right) {
      if (left) diff.push(`  ${left}`);
    } else {
      if (left) diff.push(`- ${left}`);
      if (right) diff.push(`+ ${right}`);
    }
  }

  if (diff.length === 0) return ['  (no textual diff)'];
  return diff.slice(0, 200);
}
