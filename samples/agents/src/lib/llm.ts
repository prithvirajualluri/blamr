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

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/** Repair common LLM JSON mistakes (unquoted keys, trailing commas, schema placeholders). */
function repairJson(text: string): string {
  let s = stripJsonFence(text);
  // Prompt placeholders copied literally (e.g. "confidence":0.0-1.0)
  s = s.replace(/:\s*0\.0\s*-\s*1\.0/g, ':0.85');
  s = s.replace(/:\s*boolean/g, ':true');
  s = s.replace(/:\s*number/g, ':0');
  s = s.replace(/:\s*True\b/g, ':true');
  s = s.replace(/:\s*False\b/g, ':false');
  s = s.replace(/:\s*None\b/g, ':null');
  s = s.replace(/:\s*undefined\b/g, ':null');
  // Half-quoted keys: ,confidence": → ,"confidence":
  s = s.replace(/([\{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1"$2":');
  // Unquoted keys: ,confidence: → ,"confidence":
  s = s.replace(/([\{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  for (const candidate of [raw, repairJson(raw)]) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Last-resort: pull common planner/classifier fields when JSON is still invalid. */
function fallbackObjectFromText(text: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const sub = text.match(/sub_queries"\s*:\s*\[([\s\S]*?)\]/i);
  if (sub) {
    const items = [...sub[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) =>
      m[1].replace(/\\"/g, '"'),
    );
    if (items.length) out.sub_queries = items;
  }
  const focus = text.match(/focus"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  if (focus) out.focus = focus[1].replace(/\\"/g, '"');
  const conf = text.match(/confidence"\s*:\s*([0-9.]+)/i);
  if (conf) out.confidence = Number(conf[1]);
  const cat = text.match(/category"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  if (cat) out.category = cat[1];
  return Object.keys(out).length ? out : null;
}

export function parseJsonBlock(text: string): Record<string, unknown> {
  const match = stripJsonFence(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Expected JSON in model output: ${text.slice(0, 120)}`);

  const raw = match[0];
  const parsed = tryParseJson(raw);
  if (parsed) return parsed;

  const fallback = fallbackObjectFromText(raw);
  if (fallback) return fallback;

  throw new Error(`Invalid JSON in model output: ${text.slice(0, 200)}`);
}
