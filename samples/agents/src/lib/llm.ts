import { loadEnv } from './load-env.js';
loadEnv();
import { computeHopSignals, computeConfidenceOut } from '@blamr/sdk';

export interface LlmResult {
  text: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_usd: number;
}

export interface CompleteOptions {
  model?: string;
  temperature?: number;
}

function llmBaseUrl(): string {
  return (process.env.BLAMR_LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
}

function defaultModel(): string {
  return (
    process.env.BLAMR_LLM_CHAT_MODEL?.trim() ||
    process.env.BLAMR_LLM_REASON_MODEL?.trim() ||
    'llama3.2:3b'
  );
}

export async function complete(
  system: string,
  user: string,
  options: CompleteOptions = {},
): Promise<LlmResult> {
  const model = options.model ?? defaultModel();
  const temperature = options.temperature ?? 0.2;
  const baseUrl = llmBaseUrl();
  const apiKey = process.env.BLAMR_LLM_API_KEY?.trim() || 'local';

  const start = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    model?: string;
    choices: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices[0]?.message?.content ?? '';
  const tokens_in = data.usage?.prompt_tokens ?? 0;
  const tokens_out = data.usage?.completion_tokens ?? 0;
  const usedModel = data.model ?? model;

  return {
    text,
    model: usedModel,
    tokens_in,
    tokens_out,
    latency_ms: Date.now() - start,
    cost_usd: 0,
  };
}

export async function requireLlmBackend(): Promise<void> {
  const base = llmBaseUrl().replace(/\/v1$/, '');
  try {
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    throw new Error(
      `Ollama not reachable at ${base} — start the stack with ./scripts/docker-up.sh or run Ollama locally`,
    );
  }
}

export function confidenceFromText(
  text: string,
  structured?: Record<string, unknown> | null,
  confidenceIn?: number,
  intentDelta?: number,
): number {
  return computeConfidenceOut({
    text,
    structured,
    confidenceIn,
    intentDelta,
    callType: 'LLM call',
  });
}

export function hopSignals(
  input: Parameters<typeof computeHopSignals>[0],
): ReturnType<typeof computeHopSignals> {
  return computeHopSignals(input);
}

export function parseJsonBlock(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Expected JSON in model output: ${text.slice(0, 120)}`);
  return JSON.parse(match[0]) as Record<string, unknown>;
}
