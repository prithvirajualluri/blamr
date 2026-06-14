export function accCol(v: number): string {
  if (v >= 0.9) return '#34D399';
  if (v >= 0.75) return '#639922';
  if (v >= 0.6) return '#BA7517';
  if (v >= 0.4) return '#E24B4A';
  return '#A32D2D';
}

export function accTextCol(v: number): string {
  if (v >= 0.75) return 'var(--grL)';
  if (v >= 0.6) return 'var(--goL)';
  return 'var(--reL)';
}

export function fC(c: number): string {
  if (c === 0) return '$0.0000';
  if (c < 0.0001) return `$${c.toFixed(6)}`;
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(4)}`;
}

/** Sum of per-hop costs from trace data. */
export function sumHopCosts(hops: Array<{ cost: number }>): number {
  return hops.reduce((s, h) => s + h.cost, 0);
}

export function fT(t: number): string {
  return t >= 1000 ? `${(t / 1000).toFixed(1)}K` : String(t);
}

export function fM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}s` : `${m}ms`;
}
