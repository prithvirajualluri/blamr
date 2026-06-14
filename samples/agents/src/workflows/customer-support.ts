/**
 * Customer support — Ollama classifies intent, tool lookup, Ollama writes the reply.
 */
import { BlamrEmitter } from '@blamr/sdk';
import { complete, hopSignals, parseJsonBlock } from '../lib/llm.js';
import { lookupPolicy, policyConfidence, intentDelta } from '../lib/policy-db.js';
import { previewText } from '../lib/preview.js';
import { workflowConfigFor } from '../lib/workflow-config.js';
import type { WorkflowResult, WorkflowRunOptions } from '../lib/workflow-types.js';

const WORKFLOW = 'customer-support';

export interface CustomerSupportOptions extends WorkflowRunOptions {
  userQuery: string;
  /** Force payroll policy on leave/PTO queries to replicate domain-mismatch failures. */
  simulateMisroute?: boolean;
}

export async function runCustomerSupport(opts: CustomerSupportOptions): Promise<WorkflowResult> {
  const endpoint = opts.endpoint || process.env.BLAMR_ENDPOINT || 'http://localhost:3001/v1';
  const emitter = new BlamrEmitter(
    {
      workflowId: WORKFLOW,
      agentId: 'intent_classifier',
      workflowConfig: workflowConfigFor(WORKFLOW),
    },
    opts.apiKey,
    endpoint,
  );

  const runId = emitter.startRun();
  console.log(`\n[${WORKFLOW}] run ${runId}`);
  console.log(`  query: "${opts.userQuery}"\n`);

  let failed = false;
  let errorSummary: string | undefined;

  try {
    const intentLlm = await complete(
      `You classify employee HR support queries. Reply with JSON only:
{"category":"leave|payroll|benefits|other","label":"short label","confidence":0.85,"reasoning":"one sentence"}`,
      opts.userQuery,
    );
    const intent = parseJsonBlock(intentLlm.text);
    const category = String(intent.category ?? 'other');
    const classifierSignals = hopSignals({
      text: intentLlm.text,
      structured: intent,
      confidenceIn: 1.0,
      callType: 'LLM call',
    });

    console.log(
      `  [intent_classifier] ollama/${intentLlm.model} category=${category} conf=${classifierSignals.confidence_out.toFixed(2)} intentΔ=${classifierSignals.intent_delta.toFixed(2)}`,
    );

    await emitter.emitEdge({
      from_agent: 'intent_classifier',
      to_agent: 'policy_lookup',
      confidence_in: 1.0,
      confidence_out: classifierSignals.confidence_out,
      intent_delta: classifierSignals.intent_delta,
      influence_score: 0.85,
      tokens_in: intentLlm.tokens_in,
      tokens_out: intentLlm.tokens_out,
      latency_ms: intentLlm.latency_ms,
      model: intentLlm.model,
      call_type: 'LLM call',
      cost_usd: intentLlm.cost_usd,
      input_preview: previewText(opts.userQuery),
      output_preview: previewText(intentLlm.text),
    });
    emitter.markHandoff({ to: 'policy_lookup', confidence: classifierSignals.confidence_out });

    const policy = opts.simulateMisroute
      ? lookupPolicy('payroll')
      : lookupPolicy(category);
    const policyDelta = intentDelta(category, policy.category);
    const toolConfOut = policyConfidence(category, policy.category, classifierSignals.confidence_out);
    console.log(
      `  [policy_lookup] policy=${policy.category} conf=${toolConfOut.toFixed(2)} intentΔ=${policyDelta.toFixed(2)}`,
    );

    await emitter.emitEdge({
      from_agent: 'policy_lookup',
      to_agent: 'response_writer',
      confidence_in: classifierSignals.confidence_out,
      confidence_out: toolConfOut,
      intent_delta: policyDelta,
      influence_score: 0.55,
      tokens_in: 0,
      tokens_out: JSON.stringify(policy.details).length,
      latency_ms: policy.latency_ms,
      model: 'policy-db',
      call_type: 'Tool call',
      cost_usd: 0,
      input_preview: previewText(`intent category: ${category}`),
      output_preview: previewText(JSON.stringify(policy.details, null, 2)),
    });
    emitter.markHandoff({ to: 'response_writer', confidence: toolConfOut });

    const writerUserMsg = `Employee question: ${opts.userQuery}\n\nIntent: ${category} — ${intent.label ?? ''}\nPolicy (${policy.category}): ${JSON.stringify(policy.details)}`;
    const writerLlm = await complete(
      `You are an HR support agent. Write a concise, helpful reply using ONLY the policy data provided. If policy data does not match the question, say so honestly.`,
      writerUserMsg,
    );
    const writerSignals = hopSignals({
      text: writerLlm.text,
      confidenceIn: toolConfOut,
      intentDelta: policyDelta * 0.5,
      callType: 'LLM call',
    });
    console.log(
      `  [response_writer] ollama/${writerLlm.model} conf=${writerSignals.confidence_out.toFixed(2)} intentΔ=${writerSignals.intent_delta.toFixed(2)}`,
    );
    console.log(`    → ${writerLlm.text.slice(0, 140)}${writerLlm.text.length > 140 ? '…' : ''}`);

    await emitter.emitEdge({
      from_agent: 'response_writer',
      to_agent: 'response_writer',
      confidence_in: toolConfOut,
      confidence_out: writerSignals.confidence_out,
      intent_delta: writerSignals.intent_delta,
      influence_score: 0.25,
      tokens_in: writerLlm.tokens_in,
      tokens_out: writerLlm.tokens_out,
      latency_ms: writerLlm.latency_ms,
      model: writerLlm.model,
      call_type: 'LLM call',
      cost_usd: writerLlm.cost_usd,
      input_preview: previewText(writerUserMsg),
      output_preview: previewText(writerLlm.text),
    });

    const queryLower = opts.userQuery.toLowerCase();
    if (
      (queryLower.includes('leave') || queryLower.includes('pto')) &&
      policy.category === 'payroll'
    ) {
      failed = true;
      errorSummary = 'Wrong policy domain: leave question answered with payroll policy';
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
