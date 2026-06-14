import type { RunSummary, WorkflowMonitorRow } from '../types';
import { groupRunsByWorkflow } from '../types';
import { computeBlamrStatus } from './blamr-status';

export interface AgentRegistryRow {
  id: string;
  workflowIds: string[];
  runCount: number;
  lastSeenAt: number;
  avgAccuracy: number;
  blamrStatus: ReturnType<typeof computeBlamrStatus>;
}

export const RUNS_PAGE_SIZE = 50;
export const WORKFLOWS_PAGE_SIZE = 40;
export const SPARKLINE_MAX = 24;

/** Format large counts for platform-scale UI (e.g. 1.2M, 10.4K). */
export function formatScaleCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function buildAgentRegistry(runs: RunSummary[]): AgentRegistryRow[] {
  const map = new Map<string, { workflows: Set<string>; runs: RunSummary[] }>();
  for (const r of runs) {
    for (const agent of r.agents) {
      const entry = map.get(agent) ?? { workflows: new Set<string>(), runs: [] };
      entry.workflows.add(r.workflow_id);
      entry.runs.push(r);
      map.set(agent, entry);
    }
  }
  return Array.from(map.entries())
    .map(([id, { workflows, runs: agentRuns }]) => {
      const lastSeenAt = Math.max(...agentRuns.map((r) => r.started_at), 0);
      const avgAccuracy =
        agentRuns.reduce((s, r) => s + r.accuracy, 0) / (agentRuns.length || 1);
      return {
        id,
        workflowIds: Array.from(workflows).sort(),
        runCount: agentRuns.length,
        lastSeenAt,
        avgAccuracy,
        blamrStatus: computeBlamrStatus(lastSeenAt),
      };
    })
    .sort((a, b) => b.runCount - a.runCount || a.id.localeCompare(b.id));
}

export function filterWorkflows(
  workflows: WorkflowMonitorRow[],
  query: string,
  health: 'all' | 'critical' | 'warning' | 'fair' | 'healthy',
): WorkflowMonitorRow[] {
  let list = workflows;
  if (health === 'critical') list = list.filter((w) => w.avgAcc < 0.6);
  else if (health === 'warning') list = list.filter((w) => w.avgAcc >= 0.6 && w.avgAcc < 0.75);
  else if (health === 'fair') list = list.filter((w) => w.avgAcc >= 0.75 && w.avgAcc < 0.9);
  else if (health === 'healthy') list = list.filter((w) => w.avgAcc >= 0.9);
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter((w) => w.id.toLowerCase().includes(q));
  }
  return list;
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function sparklineValues(runAccs: number[], max = SPARKLINE_MAX): number[] {
  if (runAccs.length <= max) return runAccs;
  return runAccs.slice(-max);
}

export { groupRunsByWorkflow };

export interface PlatformMetrics {
  totalCostUsd: number;
  totalTokens: number;
  avgDurationMs: number;
  avgCostPerRun: number;
  avgTokensPerRun: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  successRate: number;
  avgAccuracy: number;
}

export function computePlatformMetrics(runs: RunSummary[]): PlatformMetrics {
  const n = runs.length || 1;
  const successCount = runs.filter((r) => r.status === 'success').length;
  const failedCount = runs.filter((r) => r.status === 'failed').length;
  const runningCount = runs.filter((r) => r.status === 'running').length;
  const totalCostUsd = runs.reduce((s, r) => s + r.total_cost_usd, 0);
  const totalTokens = runs.reduce((s, r) => s + r.total_tokens, 0);
  const totalMs = runs.reduce((s, r) => s + r.total_ms, 0);
  const totalAcc = runs.reduce((s, r) => s + r.accuracy, 0);

  return {
    totalCostUsd,
    totalTokens,
    avgDurationMs: totalMs / n,
    avgCostPerRun: totalCostUsd / n,
    avgTokensPerRun: totalTokens / n,
    successCount,
    failedCount,
    runningCount,
    successRate: runs.length ? successCount / runs.length : 0,
    avgAccuracy: totalAcc / n,
  };
}
