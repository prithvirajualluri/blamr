import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { CausalEdge } from '@blamr/types';
import { enrichEdgesWithSemanticDrift } from './drift';
import type { DriftCache } from './cache';

class TestCache implements DriftCache {
  constructor(
    private readonly systemPrompt: string | null,
    private readonly goalSnapshot: string | null,
  ) {}

  async getRunSystemPrompt(): Promise<string | null> {
    return this.systemPrompt;
  }

  async getRunGoalSnapshot(): Promise<string | null> {
    return this.goalSnapshot;
  }

  async setRunSystemPrompt(): Promise<void> {}
  async setRunGoalSnapshot(): Promise<void> {}
  async getEmbedding(): Promise<number[] | null> {
    return null;
  }
  async setEmbedding(): Promise<void> {}
}

function edge(partial?: Partial<CausalEdge>): CausalEdge {
  return {
    id: 'e1',
    run_id: 'run_1',
    workflow_id: 'wf',
    workspace_id: 'ws',
    from_agent: 'agent',
    to_agent: 'agent',
    hop_index: 0,
    timestamp_ms: 1,
    confidence_in: 0.9,
    confidence_out: 0.9,
    intent_delta: -0.02,
    influence_score: 0.8,
    tokens_in: 0,
    tokens_out: 0,
    latency_ms: 5,
    model: 'm',
    call_type: 'LLM call',
    cost_usd: 0,
    prev_hash: '',
    edge_hash: '',
    output_preview: 'payroll summary',
    ...partial,
  };
}

describe('enrichEdgesWithSemanticDrift', () => {
  it('uses system_prompt as the primary baseline', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [0, 1] },
        ],
      }),
    }) as Response) as unknown as typeof fetch;
    process.env.BLAMR_SEMANTIC_DRIFT = '1';
    delete process.env.BLAMR_MUTATE_EDGES;
    process.env.BLAMR_OVERRIDE_ZERO_INTENT_DELTA = '1';

    const edges = [edge({ output_preview: 'payroll summary', intent_delta: -0.02 })];
    await enrichEdgesWithSemanticDrift(
      edges,
      new TestCache('pto policy guidance', null),
    );

    assert.ok((edges[0].intent_delta ?? 0) < -0.9);
    assert.equal(edges[0].signal_source, 'semantic');
    globalThis.fetch = originalFetch;
  });

  it('uses the worst drift across system_prompt and goal_snapshot', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [0.6, 0.8] },
          { index: 2, embedding: [0, 1] },
        ],
      }),
    }) as Response) as unknown as typeof fetch;
    process.env.BLAMR_SEMANTIC_DRIFT = '1';
    delete process.env.BLAMR_MUTATE_EDGES;
    process.env.BLAMR_OVERRIDE_ZERO_INTENT_DELTA = '1';

    const edges = [edge({ output_preview: 'vendor security review', intent_delta: 0 })];
    await enrichEdgesWithSemanticDrift(
      edges,
      new TestCache('incident triage', 'pto balance question'),
    );

    assert.ok((edges[0].intent_delta ?? 0) <= -1);
    assert.equal(edges[0].signal_source, 'semantic');
    globalThis.fetch = originalFetch;
  });

  it('does not guess drift when no baseline metadata exists', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = mock.fn(async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    process.env.BLAMR_SEMANTIC_DRIFT = '1';
    delete process.env.BLAMR_MUTATE_EDGES;

    const edges = [edge({ intent_delta: -0.02 })];
    const hints = await enrichEdgesWithSemanticDrift(
      edges,
      new TestCache(null, null),
    );

    assert.equal(hints.size, 0);
    assert.equal(edges[0].intent_delta, -0.02);
    assert.equal(fetchSpy.mock.calls.length, 0);
    globalThis.fetch = originalFetch;
  });
});
