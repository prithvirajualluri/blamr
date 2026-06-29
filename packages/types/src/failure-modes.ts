/** MAST taxonomy (NeurIPS 2025 multi-agent failure modes) — stable labels for UI + blame reasons. */
export type MastFailureMode =
  | 'system_design/context_overflow'
  | 'system_design/missing_tool'
  | 'system_design/rate_limit'
  | 'system_design/tool_failure'
  | 'inter_agent/wrong_output_format'
  | 'inter_agent/premature_termination'
  | 'inter_agent/bad_input_propagation'
  | 'inter_agent/intent_drift'
  | 'inter_agent/confidence_inflation';

export type BlameRole = 'originator' | 'propagator' | 'manifestor' | 'clean';

export type BlameConfidence = 'high' | 'medium' | 'ambiguous';

const FAILURE_MODE_LABELS: Record<MastFailureMode, string> = {
  'system_design/context_overflow': 'Context window exceeded',
  'system_design/missing_tool': 'Missing or unknown tool',
  'system_design/rate_limit': 'Provider rate limit',
  'system_design/tool_failure': 'Tool execution failed',
  'inter_agent/wrong_output_format': 'Invalid output format',
  'inter_agent/premature_termination': 'Null or empty agent output',
  'inter_agent/bad_input_propagation': 'Bad upstream input propagated',
  'inter_agent/intent_drift': 'Intent drift from run goal',
  'inter_agent/confidence_inflation': 'Overstated confidence',
};

const ROLE_LABELS: Record<BlameRole, string> = {
  originator: 'Originator',
  propagator: 'Propagator',
  manifestor: 'Manifestor',
  clean: 'Clean',
};

export function failureModeLabel(mode: MastFailureMode | string | undefined): string {
  if (!mode) return '';
  return FAILURE_MODE_LABELS[mode as MastFailureMode] ?? mode.replace(/\//g, ' · ').replace(/_/g, ' ');
}

export function blameRoleLabel(role: BlameRole | string | undefined): string {
  if (!role) return '';
  return ROLE_LABELS[role as BlameRole] ?? role;
}
