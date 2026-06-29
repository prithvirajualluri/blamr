import type { HopLlmReplayMessage } from '@blamr/types';
import type { ResolvedProvider } from './provider';
import { estimateReplayCostUsd } from './cost';

const LLM_TIMEOUT_MS = 120_000;

export interface LlmCallResult {
  output: string | null;
  error: string | null;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export async function executeLlmCall(params: {
  provider: ResolvedProvider;
  model: string;
  messages: HopLlmReplayMessage[];
  systemPrefix?: string;
  temperature?: number;
}): Promise<LlmCallResult> {
  const started = performance.now();
  try {
    if (params.provider.useAnthropicNative) {
      return await callAnthropic(params, started);
    }
    return await callOpenAiCompatible(params, started);
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: null,
      error: message,
      latencyMs,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };
  }
}

async function callOpenAiCompatible(
  params: {
    provider: ResolvedProvider;
    model: string;
    messages: HopLlmReplayMessage[];
    systemPrefix?: string;
    temperature?: number;
  },
  started: number,
): Promise<LlmCallResult> {
  const messages = [...params.messages];
  if (params.systemPrefix?.trim()) {
    messages.unshift({ role: 'system', content: params.systemPrefix.trim() });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model: params.model,
      messages,
    };
    if (params.temperature !== undefined) body.temperature = params.temperature;

    const res = await fetch(`${params.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - started);
    const json = (await res.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    if (!res.ok) {
      return {
        output: null,
        error: json.error?.message ?? `LLM request failed (${res.status})`,
        latencyMs,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
      };
    }

    const content = json.choices?.[0]?.message?.content ?? null;
    const tokensIn = json.usage?.prompt_tokens ?? 0;
    const tokensOut = json.usage?.completion_tokens ?? 0;

    return {
      output: content,
      error: null,
      latencyMs,
      tokensIn,
      tokensOut,
      costUsd: estimateReplayCostUsd(params.model, tokensIn, tokensOut),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(
  params: {
    provider: ResolvedProvider;
    model: string;
    messages: HopLlmReplayMessage[];
    systemPrefix?: string;
    temperature?: number;
  },
  started: number,
): Promise<LlmCallResult> {
  const systemParts: string[] = [];
  if (params.systemPrefix?.trim()) systemParts.push(params.systemPrefix.trim());

  const anthropicMessages = params.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  for (const m of params.messages) {
    if (m.role === 'system') systemParts.push(m.content);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: 4096,
      messages: anthropicMessages,
    };
    if (systemParts.length > 0) body.system = systemParts.join('\n\n');
    if (params.temperature !== undefined) body.temperature = params.temperature;

    const res = await fetch(`${params.provider.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': params.provider.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - started);
    const json = (await res.json()) as {
      error?: { message?: string };
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    if (!res.ok) {
      return {
        output: null,
        error: json.error?.message ?? `Anthropic request failed (${res.status})`,
        latencyMs,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
      };
    }

    const content =
      json.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('') ?? null;

    const tokensIn = json.usage?.input_tokens ?? 0;
    const tokensOut = json.usage?.output_tokens ?? 0;

    return {
      output: content,
      error: null,
      latencyMs,
      tokensIn,
      tokensOut,
      costUsd: estimateReplayCostUsd(params.model, tokensIn, tokensOut),
    };
  } finally {
    clearTimeout(timer);
  }
}
