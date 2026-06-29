import type { CallType, CausalEdge } from '@blamr/types';
import { HopLineageRegistry, previewFromValue } from './lineage';
import { computeConfidenceOut } from './signals';

export interface BlamrTraceEmitter {
  getCurrentRunId(): string | null;
  startRun(runId?: string): string;
  emitEdge(edge: Partial<CausalEdge>): Promise<void>;
  getDefaultAgentId(): string;
}

export interface BlamrTraceOptions {
  agent?: string;
  fromAgent?: string;
  callType?: CallType;
  model?: string;
}

interface TraceFrame {
  agent: string;
  registry: HopLineageRegistry;
}

const traceStack: TraceFrame[] = [];

function parentAgent(emitter: BlamrTraceEmitter, options: BlamrTraceOptions): string {
  const parent = traceStack[traceStack.length - 1];
  return options.fromAgent ?? parent?.agent ?? emitter.getDefaultAgentId();
}

async function emitTracedHop(
  emitter: BlamrTraceEmitter,
  options: BlamrTraceOptions,
  start: number,
  sourceHopIds: string[],
  inputPreview: string | undefined,
  result: unknown,
): Promise<void> {
  const agent = options.agent ?? emitter.getDefaultAgentId();
  const fromAgent = parentAgent(emitter, options);
  const outputPreview = previewFromValue(result);
  const text = typeof result === 'string' ? result : outputPreview;
  const edgeId = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await emitter.emitEdge({
    id: edgeId,
    from_agent: fromAgent,
    to_agent: agent,
    call_type: options.callType ?? 'Tool call',
    model: options.model ?? 'unknown',
    latency_ms: Date.now() - start,
    confidence_out: computeConfidenceOut({
      text: typeof text === 'string' ? text : undefined,
      callType: options.callType ?? 'Tool call',
    }),
    ...(inputPreview ? { input_preview: inputPreview } : {}),
    ...(outputPreview ? { output_preview: outputPreview } : {}),
    ...(sourceHopIds.length ? { source_hop_ids: sourceHopIds } : {}),
  });

  const frame = traceStack[traceStack.length - 1];
  frame?.registry.register(result, edgeId);
}

/** Run a zero-arg function as a traced causal hop. */
export async function runTraced<T>(
  emitter: BlamrTraceEmitter,
  options: BlamrTraceOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!emitter.getCurrentRunId()) emitter.startRun();

  const agent = options.agent ?? emitter.getDefaultAgentId();
  const registry = traceStack[traceStack.length - 1]?.registry ?? new HopLineageRegistry();
  traceStack.push({ agent, registry });

  const start = Date.now();
  try {
    const result = await fn();
    await emitTracedHop(emitter, options, start, [], undefined, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitter.emitEdge({
      from_agent: parentAgent(emitter, options),
      to_agent: agent,
      call_type: options.callType ?? 'Tool call',
      model: options.model ?? 'unknown',
      latency_ms: Date.now() - start,
      confidence_out: 0.2,
      intent_delta: -0.5,
      output_preview: `error: ${msg.slice(0, 200)}`,
    });
    throw err;
  } finally {
    traceStack.pop();
  }
}

/**
 * Wrap a function so each invocation emits a causal edge with previews and lineage.
 *
 * @example
 * const research = blamrTrace(emitter, { agent: 'researcher' }, async (q) => ...);
 */
export function blamrTrace<TArgs extends unknown[], TResult>(
  emitter: BlamrTraceEmitter,
  options: BlamrTraceOptions,
  fn: (...args: TArgs) => TResult | Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    if (!emitter.getCurrentRunId()) emitter.startRun();

    const agent = options.agent ?? emitter.getDefaultAgentId();
    const registry = traceStack[traceStack.length - 1]?.registry ?? new HopLineageRegistry();
    const sourceHopIds = registry.detectSources(args);
    traceStack.push({ agent, registry });

    const start = Date.now();
    const inputPreview = previewFromValue(args.length === 1 ? args[0] : args);

    try {
      const result = await fn(...args);
      await emitTracedHop(emitter, options, start, sourceHopIds, inputPreview, result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emitter.emitEdge({
        from_agent: parentAgent(emitter, options),
        to_agent: agent,
        call_type: options.callType ?? 'Tool call',
        model: options.model ?? 'unknown',
        latency_ms: Date.now() - start,
        confidence_out: 0.2,
        intent_delta: -0.5,
        output_preview: `error: ${msg.slice(0, 200)}`,
        ...(sourceHopIds.length ? { source_hop_ids: sourceHopIds } : {}),
      });
      throw err;
    } finally {
      traceStack.pop();
    }
  };
}
