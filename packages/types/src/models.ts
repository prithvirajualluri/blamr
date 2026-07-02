import type { WorkflowProfile } from './workflow-profile';
import type { BlameConfidence, BlameRole, MastFailureMode } from './failure-modes';

export type { BlameConfidence, BlameRole, MastFailureMode } from './failure-modes';
export { failureModeLabel, blameRoleLabel } from './failure-modes';

export type { WorkflowConfig } from './confidence-gate';
export type { WorkflowProfile, WorkflowDomainType } from './workflow-profile';
export type { HopEnrichmentHints } from './enrichment';
export type CallType = 'LLM call' | 'Tool call' | 'Vision call' | 'MCP call';
export type RunStatus = 'running' | 'success' | 'failed';
export type RunLayout = 'linear' | 'parallel' | 'dag';
export type Complexity = 'Simple' | 'Moderate' | 'Moderate+' | 'Complex' | 'Advanced';
export type APIScope = 'ingest:write' | 'runs:read' | 'runs:write' | 'export:read';
export type KeyEnvironment = 'live' | 'test';
export type KeyStatus = 'active' | 'revoked';
export type Plan = 'oss' | 'cloud' | 'enterprise';

export interface ReasoningTrace {
  content: string;
  model: string;
  token_count?: number;
}

export interface CausalEdge {
  id: string;
  run_id: string;
  workflow_id: string;
  workspace_id: string;
  from_agent: string;
  to_agent: string;
  hop_index: number;
  timestamp_ms: number;
  confidence_in: number;
  confidence_out: number;
  intent_delta: number;
  influence_score: number;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  model: string;
  call_type: CallType;
  cost_usd: number;
  prev_hash: string;
  edge_hash: string;
  /** Truncated input passed to the agent/tool (optional, set at ingest). */
  input_preview?: string;
  /** Truncated output produced by the agent/tool (optional, set at ingest). */
  output_preview?: string;
  /** Upstream hop edge ids whose outputs were consumed as this hop's input (data-flow lineage). */
  source_hop_ids?: string[];
  /** Reasoning trace content may be hydrated by read APIs; raw storage lives in reasoning_traces. */
  reasoning_trace?: ReasoningTrace;
  reasoning_trace_id?: string;
  signal_source?: 'reasoning' | 'heuristic' | 'semantic';
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workspace_id: string;
  status: RunStatus;
  complexity: Complexity;
  started_at: number;
  ended_at: number;
  duration_ms: number;
  total_tokens: number;
  total_cost_usd: number;
  error_summary: string | null;
  accuracy_score: number;
  agents: string[];
  layout: RunLayout;
  edges: CausalEdge[];
  goal_snapshot?: string;
  system_prompt?: string;
  system_prompt_hash?: string;
  system_prompt_agent_id?: string;
}

export type DriftType =
  | 'none'
  | 'domain_mismatch'
  | 'retrieval_miss'
  | 'severity_underrate'
  | 'confidence_inflation'
  | 'propagation'
  | 'format_error';

export interface AgentBlame {
  agent: string;
  blame_pct: number;
  is_root: boolean;
  reason: string;
  confidence_inflated: boolean;
  /** Tree-aware role (VerdictLens-style presentation on causal edges). */
  role?: BlameRole;
  /** MAST failure-mode label when detectable from hop telemetry. */
  failure_mode?: MastFailureMode | string;
  /** ML ranker fault % (when ml_fusion enabled). */
  ml_blame_pct?: number;
  /** Primary drift type attributed to this agent. */
  drift_component?: DriftType;
  signal_source?: 'reasoning' | 'heuristic' | 'semantic';
}

export interface HopDriftAnalysis {
  hop_index: number;
  agent: string;
  drift_type: DriftType;
  drift_score: number;
  confidence_ceiling: number;
  class_probs?: Record<string, number>;
  /** ML/semantic suggestions — agent telemetry unchanged in telemetry-first mode. */
  enrichment?: import('./enrichment').HopEnrichmentHints;
}

export interface MlFusionMeta {
  model_version: string;
  rule_weight: number;
  ml_weight: number;
  drift_model: string;
  ranker_model: string;
}

export interface BlameReport {
  run_id: string;
  root_cause_agent: string;
  root_cause_pct: number;
  method: 'backward_bfs_shapley' | 'ml_fusion' | string;
  computed_at_ms: number;
  agents: AgentBlame[];
  hop_analysis?: HopDriftAnalysis[];
  ml_fusion?: MlFusionMeta | null;
  /** Human-readable failure propagation steps (originator → manifestor). */
  propagation_chain?: string[];
  /** Confidence in root-cause attribution from score gap between top agents. */
  blame_confidence?: BlameConfidence;
}

export interface APIKey {
  id: string;
  key_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  workspace_id: string;
  environment: KeyEnvironment;
  scopes: APIScope[];
  created_at: number;
  last_used_at: number | null;
  call_count: number;
  status: KeyStatus;
}

export interface WorkspaceSettings {
  retention_days: number;
  confidence_inflation_threshold: number;
  intent_drift_threshold: number;
  rate_limit_per_min: number;
  /** Workspace default when a workflow does not set confidence_accept_level. */
  default_confidence_accept_level?: number;
  /** Optional per-workflow profiles keyed by workflow_id (gate, domain, goal hints). */
  workflow_configs?: Record<string, WorkflowProfile>;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  plan: Plan;
  created_at: number;
  settings: WorkspaceSettings;
}

export type WebhookEvent =
  | 'run.completed'
  | 'run.failed'
  | 'blame.detected'
  | 'confidence.inflated'
  | 'intent.drifted'
  | 'alert.high';

export interface Webhook {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  delivery_count: number;
  status: 'active' | 'disabled';
  created_at: number;
}

export interface RunSpan {
  agent: string;
  type: CallType;
  model: string;
  tokens_in: number;
  tokens_out: number;
  ms: number;
  cost: number;
}

/** One causal hop — full execution detail for trace views. */
export interface TraceHop {
  hop_index: number;
  agent: string;
  to_agent: string;
  type: CallType;
  model: string;
  tokens_in: number;
  tokens_out: number;
  ms: number;
  cost: number;
  confidence_in: number;
  confidence_out: number;
  intent_delta: number;
  influence_score: number;
  timestamp_ms: number;
  input_preview?: string;
  output_preview?: string;
  source_hop_ids?: string[];
  reasoning_trace?: ReasoningTrace;
  reasoning_trace_id?: string;
  signal_source?: 'reasoning' | 'heuristic' | 'semantic';
  /** ML drift classification (populated in blame report hop_analysis). */
  drift_type?: DriftType;
  drift_score?: number;
}

export interface RunAlert {
  sev: 'high' | 'medium' | 'low';
  title: string;
  body: string;
}

export interface ConfidenceHop {
  agent: string;
  ci: number;
  co: number;
  inflated: boolean;
}

export interface IntentHop {
  agent: string;
  pct: number;
}

export type BlamrConnectionStatus = 'live' | 'idle' | 'offline';
export function computeBlamrStatus(lastSeenAt: number, now = Date.now()): BlamrConnectionStatus {
  if (!lastSeenAt || lastSeenAt <= 0) return 'offline';
  const age = now - lastSeenAt;
  const LIVE_MS = 15 * 60 * 1000;
  const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
  if (age <= LIVE_MS) return 'live';
  if (age <= IDLE_MS) return 'idle';
  return 'offline';
}

export interface AgentConnectionSummary {
  agent_id: string;
  workflow_id: string;
  last_seen_at: number;
  blamr_status: BlamrConnectionStatus;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  run_count: number;
  avg_accuracy: number;
  last_run_at: number;
  blamr_status: BlamrConnectionStatus;
  agents: AgentConnectionSummary[];
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  retention_days: 30,
  confidence_inflation_threshold: 0.15,
  intent_drift_threshold: 0.20,
  rate_limit_per_min: 1000,
};

export const DEFAULT_WORKSPACE_ID = '00000000-0000-4000-a000-000000000001';
