import type { WorkflowProfile } from '@blamr/types';

/**
 * Per-workflow profiles (client-side). Server-side copies live in workspace.settings.workflow_configs.
 */
export const WORKFLOW_CONFIG: Record<string, WorkflowProfile> = {
  'customer-support': {
    confidence_accept_level: 0.78,
    confidence_gate_mode: 'min',
    domain_type: 'support',
  },
  'incident-triage': {
    confidence_accept_level: 0.72,
    confidence_gate_mode: 'final',
    domain_type: 'incident',
  },
  'research-assistant': {
    confidence_accept_level: 0.7,
    confidence_gate_mode: 'final',
    domain_type: 'generic',
  },
  'vendor-procurement': {
    confidence_accept_level: 0.68,
    confidence_gate_mode: 'min',
    domain_type: 'generic',
    goal_hop_index: 4,
  },
};

export function workflowConfigFor(workflowId: string): WorkflowProfile | undefined {
  const fromEnv = process.env[`BLAMR_ACCEPT_${workflowId.replace(/-/g, '_').toUpperCase()}`];
  if (fromEnv) {
    const level = Number(fromEnv);
    if (!Number.isNaN(level) && level > 0 && level <= 1) {
      return { ...WORKFLOW_CONFIG[workflowId], confidence_accept_level: level };
    }
  }
  const global = process.env.BLAMR_CONFIDENCE_ACCEPT_LEVEL;
  if (global && !WORKFLOW_CONFIG[workflowId]) {
    const level = Number(global);
    if (!Number.isNaN(level) && level > 0 && level <= 1) {
      return { confidence_accept_level: level, confidence_gate_mode: 'final', domain_type: 'generic' };
    }
  }
  return WORKFLOW_CONFIG[workflowId];
}
