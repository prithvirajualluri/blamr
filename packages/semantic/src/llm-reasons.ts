import type { AgentBlame, CausalEdge } from '@blamr/types';
import { isLlmBlameReasonEnabled } from './config';
import {
  defaultChatModel,
  llmAuthHeaders,
  parseJsonFromLlm,
  resolveLlmBackend,
} from './llm-client';

const LLM_TIMEOUT_MS = 20_000;

export interface BlameReasonContext {
  runId: string;
  errorSummary: string | null;
  edges: CausalEdge[];
  agents: AgentBlame[];
}

interface LlmReasonRow {
  agent: string;
  reason: string;
}

/** Replace signal-based reasons with LLM narratives grounded in trace I/O (failed runs). */
export async function enrichBlameReasonsWithLlm(
  ctx: BlameReasonContext,
): Promise<AgentBlame[]> {
  if (!isLlmBlameReasonEnabled() || ctx.agents.length === 0) return ctx.agents;

  const backend = resolveLlmBackend();

  const trace = [...ctx.edges]
    .sort((a, b) => a.hop_index - b.hop_index)
    .map((e) => ({
      hop: e.hop_index,
      agent: e.from_agent,
      type: e.call_type,
      intent_delta: e.intent_delta,
      confidence: `${e.confidence_in.toFixed(2)}→${e.confidence_out.toFixed(2)}`,
      input: truncate(e.input_preview ?? '', 400),
      output: truncate(e.output_preview ?? '', 400),
    }));

  const blameSummary = ctx.agents.map((a) => ({
    agent: a.agent,
    blame_pct: a.blame_pct,
    is_root: a.is_root,
    signal_reason: a.reason,
  }));

  const system = `You write concise root-cause explanations for failed multi-agent AI runs.
Use the trace I/O to explain WHAT went wrong in plain language (e.g. wrong policy domain, bad tool result).
One sentence per agent listed in blameSummary. Cite concrete mismatch from input vs output when visible.
Reply JSON only: {"reasons":[{"agent":"name","reason":"one sentence"}]}`;

  const user = JSON.stringify({
    run_id: ctx.runId,
    error: ctx.errorSummary,
    trace,
    blame: blameSummary,
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const res = await fetch(`${backend.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: llmAuthHeaders(backend),
        body: JSON.stringify({
          model: defaultChatModel(),
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) return ctx.agents;

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) return ctx.agents;

      const parsed = parseJsonFromLlm<{ reasons?: LlmReasonRow[] }>(content);
      if (!parsed?.reasons) return ctx.agents;

      const byAgent = new Map(
        parsed.reasons.filter((r) => r.agent && r.reason).map((r) => [r.agent, r.reason]),
      );

      return ctx.agents.map((a) => {
        const llmReason = byAgent.get(a.agent);
        return llmReason ? { ...a, reason: llmReason } : a;
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return ctx.agents;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
