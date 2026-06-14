export function formatRunTimestamp(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function getWorkflowCounts(runs: Array<{ workflow_id: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of runs) {
    counts[r.workflow_id] = (counts[r.workflow_id] ?? 0) + 1;
  }
  return counts;
}
