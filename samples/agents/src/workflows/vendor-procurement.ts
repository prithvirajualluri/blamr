/**
 * Vendor procurement — parallel security/finance/legal review, synthesis, compliance gate, decision.
 * Exercises DAG layout (parallel hop 1), tool + LLM mix, 7 agents, 8 hops.
 */
import { BlamrEmitter, intentDeltaFromRelevance } from '@blamr/sdk';
import { complete, hopSignals, parseJsonBlock } from '../lib/llm.js';
import {
  checkCompliance,
  lookupVendor,
  priceVsBenchmark,
  pricingBenchmark,
  securityScore,
} from '../lib/vendor-registry.js';
import { previewText } from '../lib/preview.js';
import { workflowConfigFor } from '../lib/workflow-config.js';
import type { WorkflowResult, WorkflowRunOptions } from '../lib/workflow-types.js';

const WORKFLOW = 'vendor-procurement';

export interface VendorProcurementOptions extends WorkflowRunOptions {
  /** Natural-language procurement request. */
  request: string;
  vendorId?: string;
  budgetUsd?: number;
  requiresEuData?: boolean;
  requiresSoc2?: boolean;
}

interface IntakePlan {
  vendor_id: string;
  vendor_name: string;
  category: string;
  budget_usd: number;
  requires_soc2: boolean;
  requires_eu_data: boolean;
  business_priority: string;
}

export async function runVendorProcurement(opts: VendorProcurementOptions): Promise<WorkflowResult> {
  const endpoint = opts.endpoint || process.env.BLAMR_ENDPOINT || 'http://localhost:3001/v1';
  const emitter = new BlamrEmitter(
    {
      workflowId: WORKFLOW,
      agentId: 'intake_analyst',
      workflowConfig: workflowConfigFor(WORKFLOW),
    },
    opts.apiKey,
    endpoint,
  );

  const runId = emitter.startRun();
  console.log(`\n[${WORKFLOW}] run ${runId}`);
  console.log(`  request: "${opts.request.slice(0, 100)}${opts.request.length > 100 ? '…' : ''}"\n`);

  let failed = false;
  let errorSummary: string | undefined;

  try {
    // ── Hop 0: intake ─────────────────────────────────────────────
    const intakeLlm = await complete(
      `You parse enterprise SaaS procurement requests. Reply JSON only:
{"vendor_id":"slug","vendor_name":"string","category":"analytics|security|other","budget_usd":50000,"requires_soc2":true,"requires_eu_data":false,"business_priority":"medium","confidence":0.85}`,
      opts.request,
    );
    const intake = parseJsonBlock(intakeLlm.text) as unknown as IntakePlan & { confidence?: number };
    const vendorId = opts.vendorId ?? String(intake.vendor_id ?? 'acme-analytics');
    const vendor = lookupVendor(vendorId);
    const budget = opts.budgetUsd ?? Number(intake.budget_usd ?? 10000);
    const requiresSoc2 = opts.requiresSoc2 ?? Boolean(intake.requires_soc2 ?? true);
    const requiresEu = opts.requiresEuData ?? Boolean(intake.requires_eu_data ?? true);

    const intakeSignals = hopSignals({
      text: intakeLlm.text,
      structured: intake as unknown as Record<string, unknown>,
      confidenceIn: 1.0,
      callType: 'LLM call',
    });

    console.log(
      `  [intake_analyst] ollama/${intakeLlm.model} vendor=${vendor.name} budget=$${budget} conf=${intakeSignals.confidence_out.toFixed(2)}`,
    );

    await emitter.emitEdge({
      hop_index: 0,
      from_agent: 'intake_analyst',
      to_agent: 'parallel_review',
      confidence_in: 1.0,
      confidence_out: intakeSignals.confidence_out,
      intent_delta: intakeSignals.intent_delta,
      influence_score: 0.75,
      tokens_in: intakeLlm.tokens_in,
      tokens_out: intakeLlm.tokens_out,
      latency_ms: intakeLlm.latency_ms,
      model: intakeLlm.model,
      call_type: 'LLM call',
      cost_usd: intakeLlm.cost_usd,
      input_preview: previewText(opts.request),
      output_preview: previewText(intakeLlm.text),
    });

    const intakeConf = intakeSignals.confidence_out;

    // ── Hop 1: parallel reviewers (same hop_index) ───────────────
    const secEval = securityScore(vendor, requiresSoc2);
    const secLlm = await complete(
      `You are a security reviewer. Given vendor security facts, write 2-3 sentences on risk. Be direct about gaps.`,
      `Vendor: ${vendor.name}\nSOC2: ${vendor.soc2}\nPen test: ${vendor.pen_test_date ?? 'none'}\nRegions: ${vendor.data_regions.join(', ')}\nRequires SOC2: ${requiresSoc2}\nFlags: ${secEval.flags.join(', ') || 'none'}`,
      { temperature: 0.1 },
    );
    const secSignals = hopSignals({
      text: secLlm.text,
      confidenceIn: intakeConf,
      relevance: secEval.relevance,
      callType: 'LLM call',
    });

    const priceEval = priceVsBenchmark(vendor);
    const finSignals = hopSignals({
      confidenceIn: intakeConf,
      relevance: priceEval.relevance,
      toolScore: priceEval.relevance,
      callType: 'Tool call',
    });

    const legalLlm = await complete(
      `You are a legal reviewer for SaaS contracts. Reply JSON only:
{"data_processing_ok":true,"contract_term_ok":true,"risk_notes":"one sentence","confidence":0.85}`,
      `Vendor: ${vendor.name}\nMin contract months: ${vendor.contract_min_months}\nEU data required: ${requiresEu}\nRegions offered: ${vendor.data_regions.join(', ')}`,
      { temperature: 0.1 },
    );
    const legal = parseJsonBlock(legalLlm.text);
    const legalOk = Boolean(legal.data_processing_ok) && Boolean(legal.contract_term_ok);
    const legalSignals = hopSignals({
      text: legalLlm.text,
      structured: legal,
      confidenceIn: intakeConf,
      intentDelta: legalOk ? -0.02 : -0.18,
      callType: 'LLM call',
    });

    console.log(
      `  [security_reviewer] ollama/${secLlm.model} score=${secEval.score.toFixed(2)} conf=${secSignals.confidence_out.toFixed(2)}`,
    );
    console.log(
      `  [financial_reviewer] tool pricing=${priceEval.label} ($${vendor.monthly_cost_usd}/mo) conf=${finSignals.confidence_out.toFixed(2)}`,
    );
    console.log(
      `  [legal_reviewer] ollama/${legalLlm.model} dpa_ok=${String(legal.data_processing_ok)} conf=${legalSignals.confidence_out.toFixed(2)}`,
    );

    await emitter.emitEdge({
      hop_index: 1,
      from_agent: 'security_reviewer',
      to_agent: 'synthesis_lead',
      confidence_in: intakeConf,
      confidence_out: secSignals.confidence_out,
      intent_delta: secSignals.intent_delta,
      influence_score: 0.7,
      tokens_in: secLlm.tokens_in,
      tokens_out: secLlm.tokens_out,
      latency_ms: secLlm.latency_ms + vendor.latency_ms,
      model: secLlm.model,
      call_type: 'LLM call',
      cost_usd: secLlm.cost_usd,
      input_preview: previewText(`security review: ${vendor.name}, soc2=${vendor.soc2}`),
      output_preview: previewText(secLlm.text),
    });

    await emitter.emitEdge({
      hop_index: 1,
      from_agent: 'financial_reviewer',
      to_agent: 'synthesis_lead',
      confidence_in: intakeConf,
      confidence_out: finSignals.confidence_out,
      intent_delta: finSignals.intent_delta,
      influence_score: 0.65,
      tokens_in: 0,
      tokens_out: 120,
      latency_ms: priceEval.relevance > 0.5 ? 55 : 40,
      model: 'pricing-benchmark-api',
      call_type: 'Tool call',
      cost_usd: 0,
      input_preview: previewText(`${vendor.category} benchmark for $${vendor.monthly_cost_usd}/mo`),
      output_preview: previewText(
        JSON.stringify({ ratio: priceEval.ratio, label: priceEval.label, median: pricingBenchmark(vendor.category).median }),
      ),
    });

    await emitter.emitEdge({
      hop_index: 1,
      from_agent: 'legal_reviewer',
      to_agent: 'synthesis_lead',
      confidence_in: intakeConf,
      confidence_out: legalSignals.confidence_out,
      intent_delta: legalSignals.intent_delta,
      influence_score: 0.6,
      tokens_in: legalLlm.tokens_in,
      tokens_out: legalLlm.tokens_out,
      latency_ms: legalLlm.latency_ms,
      model: legalLlm.model,
      call_type: 'LLM call',
      cost_usd: legalLlm.cost_usd,
      input_preview: previewText(`legal review: ${vendor.name}, term=${vendor.contract_min_months}mo`),
      output_preview: previewText(legalLlm.text),
    });

    const parallelConf = Math.min(secSignals.confidence_out, finSignals.confidence_out, legalSignals.confidence_out);
    const parallelIntent = Math.min(secSignals.intent_delta, finSignals.intent_delta, legalSignals.intent_delta);
    emitter.markHandoff({ to: 'synthesis_lead', confidence: parallelConf });

    // ── Hop 2: synthesis (join) ───────────────────────────────────
    const synthUser = `Procurement request: ${opts.request}

Vendor: ${vendor.name} ($${vendor.monthly_cost_usd}/mo)
Security: ${secLlm.text}
Finance: ${priceEval.label} (${priceEval.ratio.toFixed(2)}x median)
Legal: ${JSON.stringify(legal)}`;
    const synthLlm = await complete(
      `Synthesize parallel vendor review findings into a structured recommendation brief (bullet points). Note any blocking issues.`,
      synthUser,
    );
    const synthSignals = hopSignals({
      text: synthLlm.text,
      confidenceIn: parallelConf,
      intentDelta: parallelIntent * 0.6,
      callType: 'LLM call',
    });
    console.log(
      `  [synthesis_lead] ollama/${synthLlm.model} conf=${synthSignals.confidence_out.toFixed(2)} (joined 3 parallel reviews)`,
    );

    await emitter.emitEdge({
      hop_index: 2,
      from_agent: 'synthesis_lead',
      to_agent: 'compliance_gate',
      confidence_in: parallelConf,
      confidence_out: synthSignals.confidence_out,
      intent_delta: synthSignals.intent_delta,
      influence_score: 0.55,
      tokens_in: synthLlm.tokens_in,
      tokens_out: synthLlm.tokens_out,
      latency_ms: synthLlm.latency_ms,
      model: synthLlm.model,
      call_type: 'LLM call',
      cost_usd: synthLlm.cost_usd,
      input_preview: previewText(synthUser.slice(0, 400)),
      output_preview: previewText(synthLlm.text),
    });

    emitter.markHandoff({ to: 'compliance_gate', confidence: synthSignals.confidence_out });

    // ── Hop 3: compliance tool ────────────────────────────────────
    const compliance = checkCompliance(vendor, budget, requiresEu);
    const compIntent = intentDeltaFromRelevance(compliance.score);
    const compConfOut = Math.min(synthSignals.confidence_out, compliance.score);
    console.log(
      `  [compliance_gate] passed=${compliance.passed} violations=${compliance.violations.join(',') || 'none'} conf=${compConfOut.toFixed(2)}`,
    );

    await emitter.emitEdge({
      hop_index: 3,
      from_agent: 'compliance_gate',
      to_agent: 'procurement_decision',
      confidence_in: synthSignals.confidence_out,
      confidence_out: compConfOut,
      intent_delta: compIntent,
      influence_score: 0.5,
      tokens_in: 0,
      tokens_out: 80,
      latency_ms: compliance.latency_ms,
      model: 'enterprise-policy-engine',
      call_type: 'Tool call',
      cost_usd: 0,
      input_preview: previewText(`budget=$${budget} eu=${requiresEu} vendor=$${vendor.monthly_cost_usd}`),
      output_preview: previewText(JSON.stringify(compliance)),
    });

    emitter.markHandoff({ to: 'procurement_decision', confidence: compConfOut });

    // ── Hop 4: final decision ─────────────────────────────────────
    const decisionUser = `Brief:\n${synthLlm.text}\n\nCompliance: ${JSON.stringify(compliance)}\nBudget: $${budget}/mo`;
    const decisionLlm = await complete(
      `Write a final procurement decision JSON only:
{"decision":"approve|approve_with_conditions|reject","conditions":["..."],"summary":"2 sentences","confidence":0.85}`,
      decisionUser,
    );
    const decision = parseJsonBlock(decisionLlm.text);
    const decisionSignals = hopSignals({
      text: decisionLlm.text,
      structured: decision,
      confidenceIn: compConfOut,
      intentDelta: compliance.passed ? -0.02 : -0.15,
      callType: 'LLM call',
    });
    const decisionLabel = String(decision.decision ?? 'unknown');
    console.log(
      `  [procurement_decision] ollama/${decisionLlm.model} decision=${decisionLabel} conf=${decisionSignals.confidence_out.toFixed(2)}`,
    );
    console.log(`    → ${String(decision.summary ?? decisionLlm.text).slice(0, 160)}…`);

    await emitter.emitEdge({
      hop_index: 4,
      from_agent: 'procurement_decision',
      to_agent: 'procurement_decision',
      confidence_in: compConfOut,
      confidence_out: decisionSignals.confidence_out,
      intent_delta: decisionSignals.intent_delta,
      influence_score: 0.4,
      tokens_in: decisionLlm.tokens_in,
      tokens_out: decisionLlm.tokens_out,
      latency_ms: decisionLlm.latency_ms,
      model: decisionLlm.model,
      call_type: 'LLM call',
      cost_usd: decisionLlm.cost_usd,
      input_preview: previewText(decisionUser.slice(0, 400)),
      output_preview: previewText(decisionLlm.text),
    });

    if (!compliance.passed) {
      failed = true;
      errorSummary = `Compliance failed: ${compliance.violations.join(', ')}`;
    }
    if (requiresSoc2 && !vendor.soc2) {
      failed = true;
      errorSummary = errorSummary ?? 'Vendor lacks required SOC2 certification';
    }
    if (decisionLabel === 'reject' && !failed) {
      failed = true;
      errorSummary = String(decision.summary ?? 'Procurement rejected by decision agent');
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
