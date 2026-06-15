export type IntegrationHealthLevel = 'healthy' | 'attention' | 'critical';

export interface IntegrationRecommendation {
  id: string;
  severity: 'warn' | 'critical';
  title: string;
  detail: string;
}

export interface WorkflowIntegrationHealth {
  level: IntegrationHealthLevel;
  recommendations: IntegrationRecommendation[];
  runs_analyzed: number;
  edges_analyzed: number;
}

export interface EdgeSample {
  run_id: string;
  from_agent: string;
  to_agent: string;
  confidence_in: number;
  confidence_out: number;
  intent_delta: number;
  input_preview: string;
  output_preview: string;
  call_type: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
}

export interface RunSample {
  id: string;
  status: string;
}

export interface DriftHopSample {
  run_id: string;
  hop_index: number;
  drift_type: string;
  drift_score: number;
}

const VALID_CALL_TYPES = new Set(['LLM call', 'Tool call', 'Vision call', 'MCP call']);
const LLM_CALL_TYPES = new Set(['LLM call', 'Vision call']);

function hopHasZeroUsage(e: EdgeSample): boolean {
  return e.tokens_in === 0 && e.tokens_out === 0 && e.cost_usd === 0;
}

export function analyzeIntegrationHealth(
  edges: EdgeSample[],
  runs: RunSample[],
  driftHops: DriftHopSample[],
  hasWorkflowGate: boolean,
): WorkflowIntegrationHealth {
  const recommendations: IntegrationRecommendation[] = [];
  const runs_analyzed = runs.length;
  const edges_analyzed = edges.length;

  if (edges_analyzed === 0) {
    return {
      level: runs_analyzed > 0 ? 'attention' : 'healthy',
      recommendations: runs_analyzed > 0
        ? [{
            id: 'no_edges',
            severity: 'critical',
            title: 'No causal edges found',
            detail: 'Runs exist but no edges were ingested. Emit a CausalEdge per agent handoff before completeRun().',
          }]
        : [],
      runs_analyzed,
      edges_analyzed,
    };
  }

  const fromCounts = new Map<string, number>();
  for (const e of edges) {
    fromCounts.set(e.from_agent, (fromCounts.get(e.from_agent) ?? 0) + 1);
  }
  const maxFrom = Math.max(...fromCounts.values());
  if (maxFrom / edges_analyzed > 0.8 && fromCounts.size > 1) {
    const dominant = [...fromCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    recommendations.push({
      id: 'single_from_agent',
      severity: 'critical',
      title: 'Blame attribution is collapsed',
      detail: `${Math.round((maxFrom / edges_analyzed) * 100)}% of edges use from_agent "${dominant}". Set from_agent to the agent that produced each hop (e.g. search_agent, not orchestrator).`,
    });
  }

  const positiveIntent = edges.filter((e) => e.intent_delta > 0.01).length;
  if (positiveIntent > 0) {
    recommendations.push({
      id: 'positive_intent_delta',
      severity: 'critical',
      title: 'Intent drift uses wrong sign',
      detail: `${positiveIntent} hop(s) have positive intent_delta. Use ≤ 0 (goal preserved) or computeHopSignals() from @blamr/sdk — positive values disable drift detection.`,
    });
  }

  const missingPreview = edges.filter((e) => !e.input_preview?.trim() || !e.output_preview?.trim()).length;
  if (missingPreview / edges_analyzed > 0.5) {
    recommendations.push({
      id: 'missing_previews',
      severity: 'warn',
      title: 'I/O previews mostly missing',
      detail: `${Math.round((missingPreview / edges_analyzed) * 100)}% of hops lack input_preview or output_preview. Add truncated I/O for semantic drift and blame reasons.`,
    });
  }

  const invalidCallType = edges.filter((e) => e.call_type && !VALID_CALL_TYPES.has(e.call_type)).length;
  if (invalidCallType > 0) {
    recommendations.push({
      id: 'invalid_call_type',
      severity: 'warn',
      title: 'Non-standard call_type values',
      detail: `Use "LLM call", "Tool call", "MCP call", or "Vision call" — found ${invalidCallType} hop(s) with other values.`,
    });
  }

  const billableHops = edges.filter(
    (e) =>
      LLM_CALL_TYPES.has(e.call_type)
      || (e.model && e.model !== 'unknown' && e.call_type !== 'Tool call' && e.call_type !== 'MCP call'),
  );
  const billableZeroUsage = billableHops.filter(hopHasZeroUsage);
  if (billableZeroUsage.length > 0) {
    const allBillableZero = billableZeroUsage.length === billableHops.length;
    const hasTypedLlm = billableHops.some((e) => LLM_CALL_TYPES.has(e.call_type));
    recommendations.push({
      id: 'zero_cost_telemetry',
      severity: hasTypedLlm || allBillableZero ? 'critical' : 'warn',
      title: 'Cost and token telemetry missing',
      detail: `${billableZeroUsage.length} hop(s) look like LLM work (model set or "LLM call") but report 0 tokens and $0 cost. Pass tokens_in, tokens_out, latency_ms, and cost_usd from the provider on emitEdge() — blamr does not infer pricing from the model name.`,
    });
  }

  const zeroLatencyHops = edges.filter((e) => e.latency_ms === 0).length;
  if (zeroLatencyHops === edges_analyzed && edges_analyzed > 0) {
    recommendations.push({
      id: 'zero_latency',
      severity: 'warn',
      title: 'Latency not recorded',
      detail: 'Every hop has latency_ms = 0. Set latency_ms to wall-clock time for each hop so trace and cost views reflect real execution time.',
    });
  }

  const edgesByRun = new Map<string, EdgeSample[]>();
  for (const e of edges) {
    const list = edgesByRun.get(e.run_id) ?? [];
    list.push(e);
    edgesByRun.set(e.run_id, list);
  }

  const successRuns = runs.filter((r) => r.status === 'success');
  let weakSuccessRuns = 0;
  for (const run of successRuns) {
    const runEdges = edgesByRun.get(run.id) ?? [];
    const minConf = runEdges.length
      ? Math.min(...runEdges.map((e) => e.confidence_out))
      : 1;
    if (minConf < 0.5) weakSuccessRuns += 1;
  }
  if (weakSuccessRuns > 0) {
    recommendations.push({
      id: 'success_with_weak_hops',
      severity: 'critical',
      title: 'Successful runs with failed hops',
      detail: `${weakSuccessRuns} run(s) completed as success but had hops with confidence_out < 50%. Call completeRun({ businessFailed: true }) when retrieval or tools fail.`,
    });
  }

  const driftByRun = new Map<string, DriftHopSample[]>();
  for (const h of driftHops) {
    const list = driftByRun.get(h.run_id) ?? [];
    list.push(h);
    driftByRun.set(h.run_id, list);
  }
  let driftSuccessRuns = 0;
  for (const run of successRuns) {
    const hops = driftByRun.get(run.id) ?? [];
    const bad = hops.some(
      (h) =>
        h.drift_score >= 0.5
        && ['propagation', 'retrieval_miss', 'domain_mismatch'].includes(h.drift_type),
    );
    if (bad) driftSuccessRuns += 1;
  }
  if (driftSuccessRuns > 0) {
    recommendations.push({
      id: 'success_with_drift',
      severity: 'warn',
      title: 'ML drift on successful runs',
      detail: `${driftSuccessRuns} successful run(s) show propagation or retrieval drift. Outcome may not match telemetry — review completion logic.`,
    });
  }

  if (!hasWorkflowGate && weakSuccessRuns > 0) {
    recommendations.push({
      id: 'no_confidence_gate',
      severity: 'warn',
      title: 'No confidence gate configured',
      detail: 'Add a workflow profile (Settings → Workspace) with confidence_accept_level and confidence_gate_mode "min" to fail runs with weak hops automatically.',
    });
  }

  const criticalCount = recommendations.filter((r) => r.severity === 'critical').length;
  let level: IntegrationHealthLevel = 'healthy';
  if (criticalCount >= 1 || recommendations.length >= 3) level = 'critical';
  else if (recommendations.length >= 1) level = 'attention';

  return {
    level,
    recommendations,
    runs_analyzed,
    edges_analyzed,
  };
}
