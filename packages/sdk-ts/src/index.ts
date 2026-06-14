import type {
  BlameReport,
  CausalEdge,
  ConfidenceGateResult,
  WorkflowProfile,
} from '@blamr/types';
import {
  DEFAULT_CONFIDENCE_ACCEPT_LEVEL,
  evaluateConfidenceGate,
} from '@blamr/types';

export interface BlamrClientExtension {
  markHandoff(options: {
    to: string;
    confidence?: number;
    intentPreserved?: boolean;
  }): void;

  startRun(runId?: string): string;
  endRun(status: 'success' | 'failed', error?: string): Promise<BlameReport | null>;
  completeRun(options?: CompleteRunOptions): Promise<CompleteRunResult | null>;
  getCurrentRunId(): string | null;
  getWorkflowConfig(): WorkflowProfile | undefined;
}

export interface WrapClientOptions {
  workflowId: string;
  agentId: string;
  apiKey?: string;
  endpoint?: string;
  /** Per-workflow profile: gate thresholds, domain hint, goal hop. */
  workflowConfig?: WorkflowProfile;
  /** Auto-call completeRun(success) when the wrapped process exits (Node only). */
  autoCompleteRun?: boolean;
}

const PREVIEW_MAX = 500;

function truncatePreview(text: string, max = PREVIEW_MAX): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max)}…`;
}

function previewFromOpenAiArgs(args: unknown[]): string | undefined {
  const req = args[0] as { messages?: Array<{ role?: string; content?: unknown }> } | undefined;
  if (!req?.messages?.length) return undefined;
  const parts: string[] = [];
  for (const msg of req.messages.slice(-3)) {
    if (typeof msg.content === 'string' && msg.content.trim()) parts.push(msg.content.trim());
  }
  return parts.length ? truncatePreview(parts.join(' | ')) : undefined;
}

async function emitLlmHop(
  emitter: BlamrEmitter,
  options: WrapClientOptions,
  start: number,
  inputPreview: string | undefined,
  text: string,
  tokensIn: number,
  tokensOut: number,
  model: string,
): Promise<void> {
  const { computeConfidenceOut } = await import('./signals');
  await emitter.emitEdge({
    from_agent: options.agentId,
    to_agent: options.agentId,
    confidence_out: computeConfidenceOut({ text, callType: 'LLM call' }),
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: Date.now() - start,
    model: model || 'unknown',
    call_type: 'LLM call',
    ...(inputPreview ? { input_preview: inputPreview } : {}),
    ...(text ? { output_preview: truncatePreview(text) } : {}),
  });
}

function wrapOpenAiChat(
  chatTarget: object,
  emitter: BlamrEmitter,
  options: WrapClientOptions,
): object {
  return new Proxy(chatTarget, {
    get(target, chatProp) {
      if (chatProp === 'completions' && Reflect.get(target, chatProp)) {
        const comp = Reflect.get(target, chatProp) as object;
        return new Proxy(comp, {
          get(compTarget, compProp) {
            if (compProp === 'create') {
              return async (...args: unknown[]) => {
                if (!emitter.getCurrentRunId()) emitter.startRun();
                const start = Date.now();
                const inputPreview = previewFromOpenAiArgs(args);
                const createFn = Reflect.get(compTarget, compProp) as (...a: unknown[]) => Promise<unknown>;
                const response = await createFn.apply(compTarget, args);
                const resp = response as {
                  model?: string;
                  usage?: { prompt_tokens?: number; completion_tokens?: number };
                  choices?: Array<{ message?: { content?: string | null } }>;
                };
                const text = resp.choices?.[0]?.message?.content ?? '';
                await emitLlmHop(
                  emitter,
                  options,
                  start,
                  inputPreview,
                  typeof text === 'string' ? text : JSON.stringify(text),
                  resp.usage?.prompt_tokens ?? 0,
                  resp.usage?.completion_tokens ?? 0,
                  resp.model ?? 'unknown',
                );
                return response;
              };
            }
            return Reflect.get(compTarget, compProp);
          },
        });
      }
      return Reflect.get(target, chatProp);
    },
  });
}

export interface CompleteRunOptions {
  /** Business-rule failure (e.g. wrong policy domain) — takes precedence over gate pass. */
  businessFailed?: boolean;
  errorSummary?: string;
  /** Skip confidence gate even when workflowConfig.confidence_accept_level is set. */
  skipConfidenceGate?: boolean;
}

export interface CompleteRunResult {
  run_id: string;
  status: 'success' | 'failed';
  error_summary?: string;
  confidence_gate?: ConfidenceGateResult;
}

interface TrackedHop {
  hop_index: number;
  from_agent: string;
  confidence_out: number;
}

interface BlamrState {
  runId: string | null;
  hopIndex: number;
  lastConfidenceOut: number;
  lastAgent: string;
  prevHash: string;
  hops: TrackedHop[];
}

export class BlamrEmitter {
  private state: BlamrState = {
    runId: null,
    hopIndex: 0,
    lastConfidenceOut: 1.0,
    lastAgent: '',
    prevHash: '',
    hops: [],
  };

  constructor(
    private readonly options: WrapClientOptions,
    private readonly apiKey: string,
    private readonly endpoint: string,
  ) {}

  getWorkflowConfig(): WorkflowProfile | undefined {
    return this.options.workflowConfig;
  }

  startRun(runId?: string): string {
    const id = runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.state = {
      runId: id,
      hopIndex: 0,
      lastConfidenceOut: 1.0,
      lastAgent: this.options.agentId,
      prevHash: id,
      hops: [],
    };
    return id;
  }

  getCurrentRunId(): string | null {
    return this.state.runId;
  }

  markHandoff(options: { to: string; confidence?: number; intentPreserved?: boolean }) {
    if (!this.state.runId) this.startRun();
    this.state.lastAgent = options.to;
    if (options.confidence !== undefined) {
      this.state.lastConfidenceOut = options.confidence;
    }
  }

  async emitEdge(edge: Partial<CausalEdge>): Promise<void> {
    if (!this.state.runId) this.startRun();

    const fullEdge: CausalEdge = {
      id: edge.id || `edge_${Date.now()}`,
      run_id: this.state.runId!,
      workflow_id: this.options.workflowId,
      workspace_id: edge.workspace_id || '00000000-0000-4000-a000-000000000001',
      from_agent: edge.from_agent || this.options.agentId,
      to_agent: edge.to_agent || this.state.lastAgent || this.options.agentId,
      hop_index: edge.hop_index ?? this.state.hopIndex++,
      timestamp_ms: Date.now(),
      confidence_in: edge.confidence_in ?? this.state.lastConfidenceOut,
      confidence_out: edge.confidence_out ?? 1.0,
      intent_delta: edge.intent_delta ?? 0,
      influence_score: edge.influence_score ?? 0.8,
      tokens_in: edge.tokens_in ?? 0,
      tokens_out: edge.tokens_out ?? 0,
      latency_ms: edge.latency_ms ?? 0,
      model: edge.model ?? 'unknown',
      call_type: edge.call_type ?? 'LLM call',
      cost_usd: edge.cost_usd ?? 0,
      prev_hash: this.state.prevHash,
      edge_hash: edge.edge_hash || `pending_${Date.now()}`,
      ...(edge.input_preview !== undefined ? { input_preview: edge.input_preview } : {}),
      ...(edge.output_preview !== undefined ? { output_preview: edge.output_preview } : {}),
    };

    if (edge.hop_index !== undefined) {
      this.state.hopIndex = Math.max(this.state.hopIndex, edge.hop_index + 1);
    }

    this.state.hops.push({
      hop_index: fullEdge.hop_index,
      from_agent: fullEdge.from_agent,
      confidence_out: fullEdge.confidence_out,
    });

    this.state.lastConfidenceOut = fullEdge.confidence_out;
    this.state.prevHash = fullEdge.edge_hash;

    const res = await fetch(`${this.endpoint}/edges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(fullEdge),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`blamr ingest failed (${res.status}): ${text}`);
    }
  }

  /** Resolve pass/fail using business rules + optional confidence accept level. */
  resolveRunOutcome(options: CompleteRunOptions = {}): {
    status: 'success' | 'failed';
    error_summary?: string;
    confidence_gate?: ConfidenceGateResult;
  } {
    let status: 'success' | 'failed' = options.businessFailed ? 'failed' : 'success';
    let error_summary = options.errorSummary;

    const cfg = this.options.workflowConfig;
    const acceptLevel = cfg?.confidence_accept_level;

    let confidence_gate: ConfidenceGateResult | undefined;
    if (!options.skipConfidenceGate && acceptLevel !== undefined && this.state.hops.length > 0) {
      confidence_gate = evaluateConfidenceGate({
        acceptLevel,
        mode: cfg?.confidence_gate_mode,
        hops: this.state.hops,
      });
      if (!confidence_gate.passed && status === 'success') {
        status = 'failed';
        error_summary = error_summary
          ? `${error_summary}; ${confidence_gate.reason}`
          : confidence_gate.reason;
      }
    }

    return {
      status,
      ...(error_summary ? { error_summary } : {}),
      ...(confidence_gate ? { confidence_gate } : {}),
    };
  }

  /** End run with business rules + confidence accept gate (preferred over endRun). */
  async completeRun(options: CompleteRunOptions = {}): Promise<CompleteRunResult | null> {
    if (!this.state.runId) return null;

    const outcome = this.resolveRunOutcome(options);
    const cfg = this.options.workflowConfig;

    try {
      const response = await fetch(`${this.endpoint}/runs/${this.state.runId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          status: outcome.status,
          error_summary: outcome.error_summary ?? null,
          confidence_accept_level: cfg?.confidence_accept_level ?? null,
          confidence_gate_mode: cfg?.confidence_gate_mode ?? null,
          confidence_gate: outcome.confidence_gate ?? null,
        }),
      });

      const runId = this.state.runId;
      this.state.runId = null;
      if (!response.ok) return null;

      return {
        run_id: runId,
        status: outcome.status,
        ...(outcome.error_summary ? { error_summary: outcome.error_summary } : {}),
        ...(outcome.confidence_gate ? { confidence_gate: outcome.confidence_gate } : {}),
      };
    } catch {
      return null;
    }
  }

  async endRun(status: 'success' | 'failed', error?: string): Promise<BlameReport | null> {
    const result = await this.completeRun({
      businessFailed: status === 'failed',
      errorSummary: error,
      skipConfidenceGate: true,
    });
    return result ? ({ run_id: result.run_id } as BlameReport) : null;
  }
}

export function createBlamrExtension(options: WrapClientOptions): BlamrClientExtension {
  const apiKey = options.apiKey || process.env.BLAMR_API_KEY || '';
  const endpoint = options.endpoint || process.env.BLAMR_ENDPOINT || 'http://localhost:3001/v1';
  const emitter = new BlamrEmitter(options, apiKey, endpoint);

  return {
    markHandoff: (opts) => emitter.markHandoff(opts),
    startRun: (runId) => emitter.startRun(runId),
    endRun: (status, error) => emitter.endRun(status, error),
    completeRun: (opts) => emitter.completeRun(opts),
    getCurrentRunId: () => emitter.getCurrentRunId(),
    getWorkflowConfig: () => emitter.getWorkflowConfig(),
  };
}

export function wrapClient<T extends Record<string, unknown>>(
  client: T,
  options: WrapClientOptions,
): T & { blamr: BlamrClientExtension } {
  const apiKey = options.apiKey || process.env.BLAMR_API_KEY || '';
  const endpoint = options.endpoint || process.env.BLAMR_ENDPOINT || 'http://localhost:3001/v1';
  const emitter = new BlamrEmitter(options, apiKey, endpoint);

  if (options.autoCompleteRun && typeof process !== 'undefined') {
    const finalize = () => {
      if (emitter.getCurrentRunId()) {
        void emitter.completeRun().catch(() => {});
      }
    };
    process.once('beforeExit', finalize);
    process.once('SIGINT', () => {
      finalize();
      process.exit(130);
    });
  }

  const handler: ProxyHandler<T> = {
    get(target, prop, receiver) {
      if (prop === 'blamr') {
        return createBlamrExtension(options);
      }

      const value = Reflect.get(target, prop, receiver);
      if (prop === 'chat' && value && typeof value === 'object') {
        return wrapOpenAiChat(value as object, emitter, options);
      }
      return value;
    },
  };

  return new Proxy(client, handler) as T & { blamr: BlamrClientExtension };
}

export {
  DEFAULT_CONFIDENCE_ACCEPT_LEVEL,
  evaluateConfidenceGate,
} from '@blamr/types';
export type {
  WorkflowConfig,
  WorkflowProfile,
  WorkflowDomainType,
  ConfidenceGateMode,
  ConfidenceGateResult,
} from '@blamr/types';
export { extractConfidence, extractStructuredConfidence, tryParseJsonObject, clamp01 } from './confidence';
export {
  alignmentCeiling,
  intentDeltaFromRelevance,
  intentDeltaFromAlignment,
  computeConfidenceOut,
  computeHopSignals,
} from './signals';
export type { ConfidenceOutInput, HopSignalsInput, HopSignals } from './signals';
