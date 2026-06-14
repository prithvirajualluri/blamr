/** How to measure confidence against the accept threshold. */
export type ConfidenceGateMode = 'final' | 'min';

/** Per-workflow pass/fail thresholds (set in SDK or agent config). */
export interface WorkflowConfig {
  /**
   * Minimum confidence_out required to pass (0–1).
   * Runs below this are marked failed unless a business rule already failed them.
   */
  confidence_accept_level?: number;
  /** Which hop confidence to compare. Default `final` (last hop out). */
  confidence_gate_mode?: ConfidenceGateMode;
}

export const DEFAULT_CONFIDENCE_ACCEPT_LEVEL = 0.7;

export interface ConfidenceGateHop {
  hop_index: number;
  from_agent: string;
  confidence_out: number;
}

export interface ConfidenceGateFailingHop {
  hop_index: number;
  agent: string;
  confidence_out: number;
}

export interface ConfidenceGateResult {
  passed: boolean;
  accept_level: number;
  measured_confidence: number;
  mode: ConfidenceGateMode;
  failing_hop?: ConfidenceGateFailingHop;
  reason: string;
}

export interface ConfidenceGateInput {
  acceptLevel?: number;
  mode?: ConfidenceGateMode;
  hops: ConfidenceGateHop[];
}

function sortedHops(hops: ConfidenceGateHop[]): ConfidenceGateHop[] {
  return [...hops].sort((a, b) => a.hop_index - b.hop_index);
}

/** Evaluate whether a run meets the configured confidence accept level. */
export function evaluateConfidenceGate(input: ConfidenceGateInput): ConfidenceGateResult {
  const accept_level = input.acceptLevel ?? DEFAULT_CONFIDENCE_ACCEPT_LEVEL;
  const mode: ConfidenceGateMode = input.mode ?? 'final';
  const hops = sortedHops(input.hops);

  if (hops.length === 0) {
    return {
      passed: true,
      accept_level,
      measured_confidence: 1,
      mode,
      reason: 'No hops recorded — confidence gate skipped.',
    };
  }

  let measured_confidence: number;
  let failing_hop: ConfidenceGateFailingHop | undefined;

  if (mode === 'min') {
    const weakest = hops.reduce((min, h) => (h.confidence_out < min.confidence_out ? h : min), hops[0]);
    measured_confidence = weakest.confidence_out;
    if (weakest.confidence_out < accept_level) {
      failing_hop = {
        hop_index: weakest.hop_index,
        agent: weakest.from_agent,
        confidence_out: weakest.confidence_out,
      };
    }
  } else {
    const last = hops.at(-1)!;
    measured_confidence = last.confidence_out;
    if (last.confidence_out < accept_level) {
      failing_hop = {
        hop_index: last.hop_index,
        agent: last.from_agent,
        confidence_out: last.confidence_out,
      };
    }
  }

  const passed = measured_confidence >= accept_level;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const threshold = pct(accept_level);
  const measured = pct(measured_confidence);

  let reason: string;
  if (passed) {
    reason =
      mode === 'min'
        ? `All hops met the ${threshold} confidence threshold (weakest: ${measured}).`
        : `Final hop confidence ${measured} met the ${threshold} accept threshold.`;
  } else if (failing_hop) {
    reason =
      mode === 'min'
        ? `Hop ${failing_hop.hop_index} (${failing_hop.agent.replace(/_/g, ' ')}) at ${pct(failing_hop.confidence_out)} is below the ${threshold} accept threshold.`
        : `Final hop (${failing_hop.agent.replace(/_/g, ' ')}) confidence ${measured} is below the ${threshold} accept threshold.`;
  } else {
    reason = `Measured confidence ${measured} is below the ${threshold} accept threshold.`;
  }

  return {
    passed,
    accept_level,
    measured_confidence,
    mode,
    ...(failing_hop ? { failing_hop } : {}),
    reason,
  };
}
