/** Provider usage captured by wrapClient (Anthropic / OpenAI). */
export interface ProviderUsage {
  model: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  captured_at_ms: number;
}

export interface TelemetryConfig {
  /**
   * When true, emitEdge fills missing tokens/cost from previews + model pricing.
   * Env: BLAMR_ENRICH_USAGE=1 (default on).
   */
  enrichMissingUsage?: boolean;
  /**
   * When true, emitEdge consumes usage from the last wrapped LLM call if tokens are 0.
   * Env: BLAMR_ATTACH_PROVIDER_USAGE=1 (default on).
   */
  attachProviderUsage?: boolean;
  /** Rough chars-per-token for preview estimation (default 4). */
  charsPerToken?: number;
  /** Override or extend default model pricing (USD per 1M tokens). */
  modelPricing?: Record<string, { inputPer1M: number; outputPer1M: number }>;
}

const DEFAULT_CHARS_PER_TOKEN = 4;

/** USD per 1M tokens — extend via telemetry.modelPricing. */
const DEFAULT_MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-sonnet-latest': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-haiku-latest': { inputPer1M: 0.8, outputPer1M: 4 },
  'claude-3-opus-latest': { inputPer1M: 15, outputPer1M: 75 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'llama3.2:3b': { inputPer1M: 0, outputPer1M: 0 },
};

const CALL_TYPE_ALIASES: Record<string, string> = {
  tool_call: 'Tool call',
  llm_call: 'LLM call',
  mcp_call: 'MCP call',
  vision_call: 'Vision call',
};

export function resolveTelemetryConfig(cfg?: TelemetryConfig): Required<TelemetryConfig> {
  const envEnrich =
    typeof process !== 'undefined' && process.env?.BLAMR_ENRICH_USAGE !== undefined
      ? process.env.BLAMR_ENRICH_USAGE !== '0' && process.env.BLAMR_ENRICH_USAGE !== 'false'
      : cfg?.enrichMissingUsage ?? true;
  const envAttach =
    typeof process !== 'undefined' && process.env?.BLAMR_ATTACH_PROVIDER_USAGE !== undefined
      ? process.env.BLAMR_ATTACH_PROVIDER_USAGE !== '0' && process.env.BLAMR_ATTACH_PROVIDER_USAGE !== 'false'
      : cfg?.attachProviderUsage ?? true;
  return {
    enrichMissingUsage: cfg?.enrichMissingUsage ?? envEnrich,
    attachProviderUsage: cfg?.attachProviderUsage ?? envAttach,
    charsPerToken: cfg?.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN,
    modelPricing: { ...DEFAULT_MODEL_PRICING, ...cfg?.modelPricing },
  };
}

function estimateTokens(text: string | undefined, charsPerToken: number): number {
  if (!text?.trim()) return 0;
  return Math.max(1, Math.ceil(text.trim().length / charsPerToken));
}

function resolvePricing(
  model: string,
  pricing: Record<string, { inputPer1M: number; outputPer1M: number }>,
): { inputPer1M: number; outputPer1M: number } | null {
  if (!model || model === 'unknown') return null;
  if (pricing[model]) return pricing[model];
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(pricing)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return value;
    }
  }
  if (lower.includes('sonnet')) return { inputPer1M: 3, outputPer1M: 15 };
  if (lower.includes('haiku')) return { inputPer1M: 0.8, outputPer1M: 4 };
  if (lower.includes('opus')) return { inputPer1M: 15, outputPer1M: 75 };
  if (lower.includes('gpt-4o-mini')) return { inputPer1M: 0.15, outputPer1M: 0.6 };
  if (lower.includes('gpt-4')) return { inputPer1M: 2.5, outputPer1M: 10 };
  return null;
}

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
  pricing: Record<string, { inputPer1M: number; outputPer1M: number }>,
): number {
  const rates = resolvePricing(model, pricing);
  if (!rates) return 0;
  const cost = (tokensIn * rates.inputPer1M + tokensOut * rates.outputPer1M) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function normalizeCallType(callType: string | undefined, model: string): string {
  const raw = (callType ?? 'LLM call').trim();
  const lower = raw.toLowerCase();
  if ((lower === 'tool_call' || lower === 'llm_call') && model && model !== 'unknown') {
    return 'LLM call';
  }
  const aliased = CALL_TYPE_ALIASES[raw] ?? CALL_TYPE_ALIASES[lower];
  if (aliased) return aliased;
  if (VALID_STANDARD_CALL_TYPES.has(raw)) return raw;
  if (model && model !== 'unknown') return 'LLM call';
  return raw;
}

const VALID_STANDARD_CALL_TYPES = new Set(['LLM call', 'Tool call', 'Vision call', 'MCP call']);

export interface EdgeTelemetryInput {
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  latency_ms?: number;
  model?: string;
  call_type?: string;
  input_preview?: string;
  output_preview?: string;
}

export function enrichEdgeTelemetry(
  edge: EdgeTelemetryInput,
  cfg: Required<TelemetryConfig>,
  providerUsage?: ProviderUsage | null,
): EdgeTelemetryInput {
  const out: EdgeTelemetryInput = { ...edge };
  out.call_type = normalizeCallType(out.call_type, out.model ?? 'unknown');

  let tokensIn = out.tokens_in ?? 0;
  let tokensOut = out.tokens_out ?? 0;
  let latencyMs = out.latency_ms ?? 0;
  let model = out.model ?? 'unknown';

  const missingUsage = tokensIn === 0 && tokensOut === 0 && (out.cost_usd ?? 0) === 0;

  if (missingUsage && cfg.attachProviderUsage && providerUsage) {
    tokensIn = providerUsage.tokens_in;
    tokensOut = providerUsage.tokens_out;
    latencyMs = latencyMs || providerUsage.latency_ms;
    if (model === 'unknown' || !model) model = providerUsage.model;
  }

  if (cfg.enrichMissingUsage) {
    if (tokensIn === 0) {
      tokensIn = estimateTokens(out.input_preview, cfg.charsPerToken);
    }
    if (tokensOut === 0) {
      tokensOut = estimateTokens(out.output_preview, cfg.charsPerToken);
    }
  }

  out.tokens_in = tokensIn;
  out.tokens_out = tokensOut;
  out.latency_ms = latencyMs;
  out.model = model;

  if ((out.cost_usd ?? 0) === 0 && (tokensIn > 0 || tokensOut > 0)) {
    out.cost_usd = estimateCostUsd(model, tokensIn, tokensOut, cfg.modelPricing);
  }

  return out;
}

export function providerUsageFromAnthropic(
  response: {
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  },
  latencyMs: number,
): ProviderUsage {
  return {
    model: response.model ?? 'unknown',
    tokens_in: response.usage?.input_tokens ?? 0,
    tokens_out: response.usage?.output_tokens ?? 0,
    latency_ms: latencyMs,
    captured_at_ms: Date.now(),
  };
}

export function providerUsageFromOpenAi(
  response: {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  },
  latencyMs: number,
): ProviderUsage {
  return {
    model: response.model ?? 'unknown',
    tokens_in: response.usage?.prompt_tokens ?? 0,
    tokens_out: response.usage?.completion_tokens ?? 0,
    latency_ms: latencyMs,
    captured_at_ms: Date.now(),
  };
}
