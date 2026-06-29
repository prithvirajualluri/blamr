export type LiveEventType = 'edge.ingested' | 'run.completed' | 'blame.completed';

export interface LiveEvent {
  type: LiveEventType;
  workspace_id: string;
  run_id: string;
  workflow_id?: string;
  timestamp_ms: number;
  payload: Record<string, unknown>;
}

export function liveEventChannel(workspaceId: string): string {
  return `blamr:live:${workspaceId}`;
}
