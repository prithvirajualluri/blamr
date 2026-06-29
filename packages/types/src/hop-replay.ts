export type HopReplayStatus = 'same' | 'improved' | 'degraded' | 'different' | 'error';

export interface HopLlmReplayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HopLlmReplayRequest {
  /** Plain-text input or last user message content when messages are not provided. */
  input?: string;
  messages?: HopLlmReplayMessage[];
  model?: string;
  temperature?: number;
  note?: string;
  /** Recompute fast blame with the replayed hop output. */
  include_blame?: boolean;
}

export interface HopLlmReplayError {
  type: string;
  message: string;
}

export interface HopLlmReplayParentHop {
  hop_index: number;
  agent: string;
  call_type: string;
  output_preview: string;
}

export interface HopLlmReplayResult {
  replay_id: string;
  run_id: string;
  hop_index: number;
  edge_id: string;
  model: string;
  provider: string;
  original_input: string;
  new_input: string;
  original_output: string | null;
  new_output: string | null;
  original_latency_ms: number;
  new_latency_ms: number;
  original_tokens_in: number;
  original_tokens_out: number;
  new_tokens_in: number;
  new_tokens_out: number;
  original_cost_usd: number;
  new_cost_usd: number;
  output_diff: string[];
  status: HopReplayStatus;
  error?: HopLlmReplayError | null;
  parent_context?: HopLlmReplayParentHop[];
  note?: string;
  created_at_ms: number;
  blame?: {
    original: { root_cause_agent: string; root_cause_pct: number };
    counterfactual: { root_cause_agent: string; root_cause_pct: number };
    diff: Array<{ agent: string; before_pct: number; after_pct: number; delta: number }>;
  } | null;
}

export interface HopLlmReplaySummary {
  replay_id: string;
  run_id: string;
  hop_index: number;
  agent: string;
  model: string;
  status: HopReplayStatus;
  note?: string | null;
  created_at_ms: number;
}
