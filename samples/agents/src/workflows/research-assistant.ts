/**
 * Research assistant — Ollama plans, summarizes KB hits, synthesizes answer.
 */
import { BlamrEmitter } from '@blamr/sdk';
import { complete, hopSignals, parseJsonBlock } from '../lib/llm.js';
import { searchKnowledge } from '../lib/knowledge-base.js';
import { previewText } from '../lib/preview.js';
import { workflowConfigFor } from '../lib/workflow-config.js';
import type { WorkflowResult, WorkflowRunOptions } from '../lib/workflow-types.js';

const WORKFLOW = 'research-assistant';

export interface ResearchOptions extends WorkflowRunOptions {
  question: string;
}

export async function runResearchAssistant(opts: ResearchOptions): Promise<WorkflowResult> {
  const endpoint = opts.endpoint || process.env.BLAMR_ENDPOINT || 'http://localhost:3001/v1';
  const emitter = new BlamrEmitter(
    {
      workflowId: WORKFLOW,
      agentId: 'query_planner',
      workflowConfig: workflowConfigFor(WORKFLOW),
    },
    opts.apiKey,
    endpoint,
  );

  const runId = emitter.startRun();
  console.log(`\n[${WORKFLOW}] run ${runId}`);
  console.log(`  question: "${opts.question}"\n`);

  let failed = false;
  let errorSummary: string | undefined;

  try {
    const plannerLlm = await complete(
      `You decompose research questions into search sub-queries. Reply JSON only:
{"sub_queries":["q1","q2"],"focus":"one sentence goal","confidence":0.0-1.0}`,
      opts.question,
    );
    const plan = parseJsonBlock(plannerLlm.text);
    const subQueries = Array.isArray(plan.sub_queries)
      ? (plan.sub_queries as string[]).slice(0, 2)
      : [opts.question];
    const plannerSignals = hopSignals({
      text: plannerLlm.text,
      structured: plan,
      confidenceIn: 1.0,
      callType: 'LLM call',
    });

    console.log(
      `  [query_planner] ollama/${plannerLlm.model} sub_queries=${subQueries.length} conf=${plannerSignals.confidence_out.toFixed(2)}`,
    );

    await emitter.emitEdge({
      from_agent: 'query_planner',
      to_agent: 'kb_retriever',
      confidence_in: 1.0,
      confidence_out: plannerSignals.confidence_out,
      intent_delta: plannerSignals.intent_delta,
      influence_score: 0.8,
      tokens_in: plannerLlm.tokens_in,
      tokens_out: plannerLlm.tokens_out,
      latency_ms: plannerLlm.latency_ms,
      model: plannerLlm.model,
      call_type: 'LLM call',
      cost_usd: plannerLlm.cost_usd,
      input_preview: previewText(opts.question),
      output_preview: previewText(plannerLlm.text),
    });

    emitter.markHandoff({ to: 'kb_retriever', confidence: plannerSignals.confidence_out });

    const hits = searchKnowledge(subQueries.join(' '));
    const kbRelevance = hits.reduce((s, h) => s + h.relevance, 0) / hits.length;
    const kbSignals = hopSignals({
      confidenceIn: plannerSignals.confidence_out,
      relevance: kbRelevance,
      callType: 'Tool call',
    });
    console.log(
      `  [kb_retriever] hits=${hits.length} avg_relevance=${kbRelevance.toFixed(2)} conf=${kbSignals.confidence_out.toFixed(2)} intentΔ=${kbSignals.intent_delta.toFixed(2)}`,
    );

    await emitter.emitEdge({
      from_agent: 'kb_retriever',
      to_agent: 'summarizer',
      confidence_in: plannerSignals.confidence_out,
      confidence_out: kbSignals.confidence_out,
      intent_delta: kbSignals.intent_delta,
      influence_score: 0.6,
      tokens_in: 0,
      tokens_out: hits.map((h) => h.excerpt).join(' ').length,
      latency_ms: hits[0]?.latency_ms ?? 40,
      model: 'knowledge-base',
      call_type: 'Tool call',
      cost_usd: 0,
      input_preview: previewText(subQueries.join('; ')),
      output_preview: previewText(hits.map((h) => `[${h.source}] ${h.excerpt}`).join('\n')),
    });

    emitter.markHandoff({ to: 'summarizer', confidence: kbSignals.confidence_out });

    const summarizerUser = `Question: ${opts.question}\nFocus: ${plan.focus ?? ''}\nExcerpts:\n${hits.map((h) => `- [${h.source}] ${h.excerpt}`).join('\n')}`;
    const summarizerLlm = await complete(
      `Summarize the knowledge base excerpts into bullet facts relevant to the research question. Be factual; do not invent sources.`,
      summarizerUser,
    );
    const summarySignals = hopSignals({
      text: summarizerLlm.text,
      confidenceIn: kbSignals.confidence_out,
      intentDelta: kbSignals.intent_delta * 0.5,
      callType: 'LLM call',
    });
    console.log(
      `  [summarizer] ollama/${summarizerLlm.model} conf=${summarySignals.confidence_out.toFixed(2)} intentΔ=${summarySignals.intent_delta.toFixed(2)}`,
    );

    await emitter.emitEdge({
      from_agent: 'summarizer',
      to_agent: 'synthesizer',
      confidence_in: kbSignals.confidence_out,
      confidence_out: summarySignals.confidence_out,
      intent_delta: summarySignals.intent_delta,
      influence_score: 0.45,
      tokens_in: summarizerLlm.tokens_in,
      tokens_out: summarizerLlm.tokens_out,
      latency_ms: summarizerLlm.latency_ms,
      model: summarizerLlm.model,
      call_type: 'LLM call',
      cost_usd: summarizerLlm.cost_usd,
      input_preview: previewText(summarizerUser),
      output_preview: previewText(summarizerLlm.text),
    });

    emitter.markHandoff({ to: 'synthesizer', confidence: summarySignals.confidence_out });

    const synthUser = `Question: ${opts.question}\nFacts:\n${summarizerLlm.text}`;
    const synthLlm = await complete(
      `Write a short research answer (3-4 sentences) citing the provided facts. If evidence is weak, state limitations.`,
      synthUser,
    );
    const synthSignals = hopSignals({
      text: synthLlm.text,
      confidenceIn: summarySignals.confidence_out,
      intentDelta: kbSignals.intent_delta * 0.25,
      callType: 'LLM call',
    });
    console.log(
      `  [synthesizer] ollama/${synthLlm.model} conf=${synthSignals.confidence_out.toFixed(2)} intentΔ=${synthSignals.intent_delta.toFixed(2)}`,
    );
    console.log(`    → ${synthLlm.text.slice(0, 140)}${synthLlm.text.length > 140 ? '…' : ''}`);

    await emitter.emitEdge({
      from_agent: 'synthesizer',
      to_agent: 'synthesizer',
      confidence_in: summarySignals.confidence_out,
      confidence_out: synthSignals.confidence_out,
      intent_delta: synthSignals.intent_delta,
      influence_score: 0.3,
      tokens_in: synthLlm.tokens_in,
      tokens_out: synthLlm.tokens_out,
      latency_ms: synthLlm.latency_ms,
      model: synthLlm.model,
      call_type: 'LLM call',
      cost_usd: synthLlm.cost_usd,
      input_preview: previewText(synthUser),
      output_preview: previewText(synthLlm.text),
    });

    if (kbRelevance < 0.35) {
      failed = true;
      errorSummary = 'Insufficient knowledge base coverage for research question';
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
