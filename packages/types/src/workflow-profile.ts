import type { WorkspaceSettings } from './models';
import type { ConfidenceGateMode, WorkflowConfig } from './confidence-gate';
import { DEFAULT_CONFIDENCE_ACCEPT_LEVEL } from './confidence-gate';

/** Optional domain hint — improves drift/explanation quality without requiring workflow registration. */
export type WorkflowDomainType = 'incident' | 'support' | 'generic';

/**
 * Per-workflow profile (optional). Workflows work without this; quality improves when set
 * server-side in workspace.settings.workflow_configs or client-side via SDK workflowConfig.
 */
export interface WorkflowProfile extends WorkflowConfig {
  domain_type?: WorkflowDomainType;
  /** Hop whose input_preview is the run goal (default 0). */
  goal_hop_index?: number;
}

export interface ResolvedWorkflowGate {
  acceptLevel: number;
  mode: ConfidenceGateMode;
  profile: WorkflowProfile;
  source: 'event' | 'workspace_workflow' | 'workspace_default' | 'platform_default';
}

function inferDomainFromWorkflowId(workflowId: string): WorkflowDomainType {
  const id = workflowId.toLowerCase();
  if (id.includes('incident') || id.includes('triage') || id.includes('alert')) return 'incident';
  if (id.includes('support') || id.includes('help') || id.includes('ticket')) return 'support';
  return 'generic';
}

/** Resolve domain type: explicit profile wins, then workflow_id heuristics. */
export function resolveDomainType(
  workflowId: string,
  profile?: Pick<WorkflowProfile, 'domain_type'>,
): WorkflowDomainType {
  if (profile?.domain_type) return profile.domain_type;
  return inferDomainFromWorkflowId(workflowId);
}

export function isIncidentDomain(
  workflowId: string,
  profile?: Pick<WorkflowProfile, 'domain_type'>,
): boolean {
  return resolveDomainType(workflowId, profile) === 'incident';
}

/** Merge gate config: completeRun event > workspace workflow_configs > workspace default > platform default. */
export function resolveWorkflowGate(
  workflowId: string,
  workspaceSettings?: Pick<WorkspaceSettings, 'workflow_configs' | 'default_confidence_accept_level'>,
  event?: Partial<WorkflowProfile> & {
    confidence_accept_level?: number | null;
    confidence_gate_mode?: ConfidenceGateMode | null;
  },
): ResolvedWorkflowGate {
  const wsProfile = workspaceSettings?.workflow_configs?.[workflowId];
  const profile: WorkflowProfile = { ...wsProfile, ...event };

  let acceptLevel = DEFAULT_CONFIDENCE_ACCEPT_LEVEL;
  let mode: ConfidenceGateMode = profile.confidence_gate_mode ?? 'final';
  let source: ResolvedWorkflowGate['source'] = 'platform_default';

  if (workspaceSettings?.default_confidence_accept_level !== undefined) {
    acceptLevel = workspaceSettings.default_confidence_accept_level;
    source = 'workspace_default';
  }

  if (wsProfile?.confidence_accept_level !== undefined) {
    acceptLevel = wsProfile.confidence_accept_level;
    mode = wsProfile.confidence_gate_mode ?? mode;
    source = 'workspace_workflow';
  }

  if (profile.confidence_accept_level !== undefined && event?.confidence_accept_level == null) {
    acceptLevel = profile.confidence_accept_level;
    mode = profile.confidence_gate_mode ?? mode;
    if (source === 'platform_default' || source === 'workspace_default') {
      source = wsProfile ? 'workspace_workflow' : source;
    }
  }

  if (event?.confidence_accept_level != null) {
    acceptLevel = event.confidence_accept_level;
    source = 'event';
  }
  if (event?.confidence_gate_mode) {
    mode = event.confidence_gate_mode;
  }

  return { acceptLevel, mode, profile, source };
}
