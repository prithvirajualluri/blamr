/**
 * Incident triage — Ollama classifies, assesses impact, recommends runbook.
 */
import { BlamrEmitter, intentDeltaFromAlignment } from '@blamr/sdk';
import { complete, hopSignals, parseJsonBlock } from '../lib/llm.js';
import { lookupRunbook, runbookConfidence } from '../lib/runbooks.js';
import { previewText } from '../lib/preview.js';
import { workflowConfigFor } from '../lib/workflow-config.js';
import type { WorkflowResult, WorkflowRunOptions } from '../lib/workflow-types.js';

const WORKFLOW = 'incident-triage';

export interface IncidentOptions extends WorkflowRunOptions {
  alertText: string;
}

export async function runIncidentTriage(opts: IncidentOptions): Promise<WorkflowResult> {
  const endpoint = opts.endpoint || process.env.BLAMR_ENDPOINT || 'http://localhost:3001/v1';
  const emitter = new BlamrEmitter(
    {
      workflowId: WORKFLOW,
      agentId: 'alert_classifier',
      workflowConfig: workflowConfigFor(WORKFLOW),
    },
    opts.apiKey,
    endpoint,
  );

  const runId = emitter.startRun();
  console.log(`\n[${WORKFLOW}] run ${runId}`);
  console.log(`  alert: "${opts.alertText.slice(0, 80)}${opts.alertText.length > 80 ? '…' : ''}"\n`);

  let failed = false;
  let errorSummary: string | undefined;

  try {
    const classifyLlm = await complete(
      `You classify production alerts. Reply JSON only:
{"category":"outage|latency|error_spike|security|other","service":"service name","confidence":0.0-1.0,"reasoning":"one sentence"}`,
      opts.alertText,
    );
    const classification = parseJsonBlock(classifyLlm.text);
    const category = String(classification.category ?? 'other');
    const classifySignals = hopSignals({
      text: classifyLlm.text,
      structured: classification,
      confidenceIn: 1.0,
      callType: 'LLM call',
    });

    console.log(
      `  [alert_classifier] ollama/${classifyLlm.model} category=${category} conf=${classifySignals.confidence_out.toFixed(2)}`,
    );

    await emitter.emitEdge({
      from_agent: 'alert_classifier',
      to_agent: 'impact_assessor',
      confidence_in: 1.0,
      confidence_out: classifySignals.confidence_out,
      intent_delta: classifySignals.intent_delta,
      influence_score: 0.82,
      tokens_in: classifyLlm.tokens_in,
      tokens_out: classifyLlm.tokens_out,
      latency_ms: classifyLlm.latency_ms,
      model: classifyLlm.model,
      call_type: 'LLM call',
      cost_usd: classifyLlm.cost_usd,
      input_preview: previewText(opts.alertText),
      output_preview: previewText(classifyLlm.text),
    });

    emitter.markHandoff({ to: 'impact_assessor', confidence: classifySignals.confidence_out });

    const impactUser = `Alert: ${opts.alertText}\nClassification: ${category} / ${classification.service ?? 'unknown'}`;
    const impactLlm = await complete(
      `Assess incident severity for on-call. Reply JSON only:
{"severity":"P1|P2|P3","user_impact":"brief","blast_radius":"brief","confidence":0.0-1.0,"reasoning":"one sentence"}`,
      impactUser,
    );
    const impact = parseJsonBlock(impactLlm.text);
    const severity = String(impact.severity ?? 'P3').toUpperCase();
    const impactDrift = intentDeltaFromAlignment(category, severity);
    const impactSignals = hopSignals({
      text: impactLlm.text,
      structured: impact,
      confidenceIn: classifySignals.confidence_out,
      intentDelta: impactDrift,
      callType: 'LLM call',
    });

    console.log(
      `  [impact_assessor] ollama/${impactLlm.model} severity=${severity} conf=${impactSignals.confidence_out.toFixed(2)} intentΔ=${impactSignals.intent_delta.toFixed(2)}`,
    );

    await emitter.emitEdge({
      from_agent: 'impact_assessor',
      to_agent: 'runbook_selector',
      confidence_in: classifySignals.confidence_out,
      confidence_out: impactSignals.confidence_out,
      intent_delta: impactSignals.intent_delta,
      influence_score: 0.65,
      tokens_in: impactLlm.tokens_in,
      tokens_out: impactLlm.tokens_out,
      latency_ms: impactLlm.latency_ms,
      model: impactLlm.model,
      call_type: 'LLM call',
      cost_usd: impactLlm.cost_usd,
      input_preview: previewText(impactUser),
      output_preview: previewText(impactLlm.text),
    });

    emitter.markHandoff({ to: 'runbook_selector', confidence: impactSignals.confidence_out });

    const runbook = lookupRunbook(severity);
    const rbConf = runbookConfidence(severity, impactSignals.confidence_out);
    console.log(`  [runbook_selector] runbook=${runbook.runbook_id} conf=${rbConf.toFixed(2)}`);

    await emitter.emitEdge({
      from_agent: 'runbook_selector',
      to_agent: 'action_planner',
      confidence_in: impactSignals.confidence_out,
      confidence_out: rbConf,
      intent_delta: -0.02,
      influence_score: 0.5,
      tokens_in: 0,
      tokens_out: runbook.steps.join(' ').length,
      latency_ms: runbook.latency_ms,
      model: 'runbook-db',
      call_type: 'Tool call',
      cost_usd: 0,
      input_preview: previewText(`severity: ${severity}`),
      output_preview: previewText(runbook.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')),
    });

    emitter.markHandoff({ to: 'action_planner', confidence: rbConf });

    const planUser = `Alert: ${opts.alertText}\nSeverity: ${severity}\nImpact: ${impact.user_impact ?? ''}\nRunbook (${runbook.title}):\n${runbook.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    const planLlm = await complete(
      `You are an incident commander. Produce a numbered action plan from the runbook steps. Keep it under 5 steps.`,
      planUser,
    );
    const planSignals = hopSignals({
      text: planLlm.text,
      confidenceIn: rbConf,
      intentDelta: impactSignals.intent_delta * 0.4,
      callType: 'LLM call',
    });
    console.log(
      `  [action_planner] ollama/${planLlm.model} conf=${planSignals.confidence_out.toFixed(2)} intentΔ=${planSignals.intent_delta.toFixed(2)}`,
    );
    console.log(`    → ${planLlm.text.slice(0, 140)}${planLlm.text.length > 140 ? '…' : ''}`);

    await emitter.emitEdge({
      from_agent: 'action_planner',
      to_agent: 'action_planner',
      confidence_in: rbConf,
      confidence_out: planSignals.confidence_out,
      intent_delta: planSignals.intent_delta,
      influence_score: 0.28,
      tokens_in: planLlm.tokens_in,
      tokens_out: planLlm.tokens_out,
      latency_ms: planLlm.latency_ms,
      model: planLlm.model,
      call_type: 'LLM call',
      cost_usd: planLlm.cost_usd,
      input_preview: previewText(planUser),
      output_preview: previewText(planLlm.text),
    });

    if (category === 'security' && severity === 'P3') {
      failed = true;
      errorSummary = 'Security alert under-severity: classified P3 but may require P1 escalation';
    }
    if (opts.forceFail && !failed) {
      failed = true;
      errorSummary = errorSummary || 'Forced failure (BLAMR_FORCE_FAIL) for testing';
    }
  } catch (err) {
    failed = true;
    errorSummary = err instanceof Error ? err.message : 'Workflow error';
    console.error(`  [error] ${errorSummary}`);
  }

  const completed = await emitter.completeRun({ businessFailed: failed, errorSummary });
  const status = completed?.status ?? (failed ? 'failed' : 'success');
  if (completed?.confidence_gate) {
    const g = completed.confidence_gate;
    console.log(
      `  [gate] ${g.passed ? 'PASS' : 'FAIL'} measured=${(g.measured_confidence * 100).toFixed(0)}% threshold=${(g.accept_level * 100).toFixed(0)}% (${g.mode})`,
    );
  }
  console.log(`  → ${status === 'failed' ? 'FAILED' : 'success'}\n`);

  return { workflowId: WORKFLOW, runId, status, errorSummary: completed?.error_summary ?? errorSummary };
}
