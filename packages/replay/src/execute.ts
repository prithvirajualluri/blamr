import { randomUUID } from 'crypto';
import type {
  CausalEdge,
  HopLlmReplayRequest,
  HopLlmReplayResult,
  HopReplayStatus,
} from '@blamr/types';
import { buildParentContext, formatParentContextSystem } from './context';
import { computeLineDiff, computeReplayStatus } from './diff';
import { executeLlmCall } from './llm-client';
import { buildReplayMessages, parseOriginalInput, serializeNewInput } from './messages';
import { providerEnvHint, resolveReplayProvider } from './provider';

const LLM_CALL_TYPES = new Set(['LLM call', 'Vision call']);

export interface ExecuteHopReplayParams {
  runId: string;
  hopIndex: number;
  edges: CausalEdge[];
  request: HopLlmReplayRequest;
}

export function isReplayableHop(edge: CausalEdge): boolean {
  return LLM_CALL_TYPES.has(edge.call_type) && Boolean(edge.model?.trim() && edge.model !== 'unknown');
}

export async function executeHopReplay(params: ExecuteHopReplayParams): Promise<HopLlmReplayResult> {
  const hop = params.edges.find((e) => e.hop_index === params.hopIndex);
  if (!hop) {
    throw new Error(`Hop ${params.hopIndex} not found on run ${params.runId}`);
  }
  if (!isReplayableHop(hop)) {
    throw new Error(
      `Hop ${params.hopIndex} is not an LLM hop (call_type=${hop.call_type}, model=${hop.model || 'none'})`,
    );
  }

  const replayId = randomUUID();
  const createdAtMs = Date.now();
  const originalInputPreview = hop.input_preview ?? '';
  const originalOutput = hop.output_preview ?? null;

  let provider;
  try {
    provider = resolveReplayProvider(hop.model, params.request.model);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult({
      replayId,
      runId: params.runId,
      hop,
      originalInputPreview,
      originalOutput,
      message,
      createdAtMs,
      note: params.request.note,
    });
  }

  const parentContext = buildParentContext(params.edges, hop);
  const systemPrefix = formatParentContextSystem(parentContext);

  let messages;
  try {
    messages = buildReplayMessages({
      requestInput: params.request.input,
      requestMessages: params.request.messages,
      originalInputPreview,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult({
      replayId,
      runId: params.runId,
      hop,
      originalInputPreview,
      originalOutput,
      message,
      createdAtMs,
      note: params.request.note,
      parentContext,
      provider: provider.name,
      model: hop.model,
    });
  }

  const newInput = serializeNewInput(messages, params.request.input);
  const callModel = params.request.model?.trim() || provider.effectiveModel;

  if (!provider.apiKey && provider.name !== 'ollama' && provider.name !== 'local') {
    return errorResult({
      replayId,
      runId: params.runId,
      hop,
      originalInputPreview,
      originalOutput,
      message: `No LLM API key configured. Set ${providerEnvHint(hop.model)}.`,
      createdAtMs,
      note: params.request.note,
      parentContext,
      provider: provider.name,
      model: callModel,
      newInput,
    });
  }

  const llm = await executeLlmCall({
    provider,
    model: callModel,
    messages,
    systemPrefix: systemPrefix || undefined,
    temperature: params.request.temperature,
  });

  const status: HopReplayStatus = llm.error
    ? 'error'
    : computeReplayStatus(originalOutput, llm.output, null, llm.error);

  return {
    replay_id: replayId,
    run_id: params.runId,
    hop_index: params.hopIndex,
    edge_id: hop.id,
    model: callModel,
    provider: provider.name,
    original_input: originalInputPreview,
    new_input: newInput,
    original_output: originalOutput,
    new_output: llm.output,
    original_latency_ms: hop.latency_ms,
    new_latency_ms: llm.latencyMs,
    original_tokens_in: hop.tokens_in,
    original_tokens_out: hop.tokens_out,
    new_tokens_in: llm.tokensIn,
    new_tokens_out: llm.tokensOut,
    original_cost_usd: hop.cost_usd,
    new_cost_usd: llm.costUsd,
    output_diff: computeLineDiff(originalOutput, llm.output),
    status,
    error: llm.error ? { type: 'llm_error', message: llm.error } : null,
    parent_context: parentContext.length > 0 ? parentContext : undefined,
    note: params.request.note,
    created_at_ms: createdAtMs,
  };
}

function errorResult(args: {
  replayId: string;
  runId: string;
  hop: CausalEdge;
  originalInputPreview: string;
  originalOutput: string | null;
  message: string;
  createdAtMs: number;
  note?: string;
  parentContext?: ReturnType<typeof buildParentContext>;
  provider?: string;
  model?: string;
  newInput?: string;
}): HopLlmReplayResult {
  const parsed = parseOriginalInput(args.originalInputPreview);
  const fallbackInput = args.newInput ?? parsed.raw ?? args.originalInputPreview;
  return {
    replay_id: args.replayId,
    run_id: args.runId,
    hop_index: args.hop.hop_index,
    edge_id: args.hop.id,
    model: args.model ?? args.hop.model,
    provider: args.provider ?? 'unknown',
    original_input: args.originalInputPreview,
    new_input: fallbackInput,
    original_output: args.originalOutput,
    new_output: null,
    original_latency_ms: args.hop.latency_ms,
    new_latency_ms: 0,
    original_tokens_in: args.hop.tokens_in,
    original_tokens_out: args.hop.tokens_out,
    new_tokens_in: 0,
    new_tokens_out: 0,
    original_cost_usd: args.hop.cost_usd,
    new_cost_usd: 0,
    output_diff: [],
    status: 'error',
    error: { type: 'replay_error', message: args.message },
    parent_context: args.parentContext?.length ? args.parentContext : undefined,
    note: args.note,
    created_at_ms: args.createdAtMs,
  };
}
