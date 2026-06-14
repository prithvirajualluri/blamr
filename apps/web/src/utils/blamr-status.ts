import { computeBlamrStatus, type BlamrConnectionStatus } from '@blamr/types';

export type { BlamrConnectionStatus };
export { computeBlamrStatus };

export interface AgentConnectionRow {
  id: string;
  workflowId: string;
  lastSeenAt: number;
  blamrStatus: BlamrConnectionStatus;
}

export const BLAMR_STATUS_LABEL: Record<BlamrConnectionStatus, string> = {
  live: 'Connected',
  idle: 'Idle',
  offline: 'Offline',
};

export const BLAMR_STATUS_HINT: Record<BlamrConnectionStatus, string> = {
  live: 'Receiving causal edges from this agent',
  idle: 'Seen recently but no activity in the last 15 minutes',
  offline: 'No recent telemetry — agent may be disconnected',
};

export function formatLastSeen(lastSeenAt: number): string {
  if (!lastSeenAt) return 'Never';
  const age = Date.now() - lastSeenAt;
  if (age < 60_000) return 'Just now';
  if (age < 3600_000) return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86400_000) return `${Math.floor(age / 3600_000)}h ago`;
  return `${Math.floor(age / 86400_000)}d ago`;
}

/** Agent traced in a specific run (has ingested causal edges). */
export type RunAgentTraceStatus = 'tracing' | 'no_edges';

export function runAgentTraceStatus(
  agentId: string,
  tracedAgentIds: Set<string>,
): RunAgentTraceStatus {
  return tracedAgentIds.has(agentId) ? 'tracing' : 'no_edges';
}

export function buildAgentConnections(
  runs: Array<{ workflow_id: string; agents: string[]; started_at: number }>,
): Map<string, AgentConnectionRow[]> {
  const byWorkflow = new Map<string, Map<string, number>>();

  for (const run of runs) {
    const wf = byWorkflow.get(run.workflow_id) ?? new Map<string, number>();
    for (const agent of run.agents) {
      wf.set(agent, Math.max(wf.get(agent) ?? 0, run.started_at));
    }
    byWorkflow.set(run.workflow_id, wf);
  }

  const result = new Map<string, AgentConnectionRow[]>();
  for (const [workflowId, agents] of byWorkflow) {
    result.set(
      workflowId,
      Array.from(agents.entries())
        .map(([id, lastSeenAt]) => ({
          id,
          workflowId,
          lastSeenAt,
          blamrStatus: computeBlamrStatus(lastSeenAt),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
  return result;
}
