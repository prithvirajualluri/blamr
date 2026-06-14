import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CausalEdge } from './models';
import { reconcileEdgeConfidenceChain, intentHarmFromDelta } from './edge-chain';

function edge(partial: Partial<CausalEdge> & Pick<CausalEdge, 'hop_index' | 'from_agent' | 'to_agent'>): CausalEdge {
  return {
    id: 'e1',
    run_id: 'run_test',
    workflow_id: 'wf',
    workspace_id: 'ws',
    timestamp_ms: 1,
    confidence_in: partial.confidence_in ?? 1,
    confidence_out: partial.confidence_out ?? 0.9,
    intent_delta: partial.intent_delta ?? -0.02,
    influence_score: partial.influence_score ?? 0.7,
    tokens_in: 0,
    tokens_out: 0,
    latency_ms: 10,
    model: 'test',
    call_type: 'LLM call',
    cost_usd: 0,
    prev_hash: 'a',
    edge_hash: 'b',
    ...partial,
  };
}

describe('reconcileEdgeConfidenceChain', () => {
  it('chains linear hops sequentially', () => {
    const edges = [
      edge({ hop_index: 0, from_agent: 'a', to_agent: 'b', confidence_in: 1, confidence_out: 0.9 }),
      edge({ hop_index: 1, from_agent: 'b', to_agent: 'c', confidence_in: 0.5, confidence_out: 0.8 }),
      edge({ hop_index: 2, from_agent: 'c', to_agent: 'c', confidence_in: 0.5, confidence_out: 0.75 }),
    ];
    reconcileEdgeConfidenceChain(edges);
    assert.equal(edges[0].confidence_in, 1);
    assert.equal(edges[1].confidence_in, 0.9);
    assert.equal(edges[2].confidence_in, 0.8);
  });

  it('assigns parallel branch confidence_in from upstream hop (not sibling)', () => {
    const edges = [
      edge({ hop_index: 0, from_agent: 'intake', to_agent: 'fork', confidence_out: 0.9 }),
      edge({ hop_index: 1, from_agent: 'security', to_agent: 'synthesis', confidence_in: 0.9, confidence_out: 0.95 }),
      edge({ hop_index: 1, from_agent: 'finance', to_agent: 'synthesis', confidence_in: 0.95, confidence_out: 0.45 }),
      edge({ hop_index: 1, from_agent: 'legal', to_agent: 'synthesis', confidence_in: 0.45, confidence_out: 0.85 }),
      edge({ hop_index: 2, from_agent: 'synthesis', to_agent: 'gate', confidence_in: 0.5, confidence_out: 0.53 }),
    ];
    reconcileEdgeConfidenceChain(edges);
    assert.equal(edges[1].confidence_in, 0.9);
    assert.equal(edges[2].confidence_in, 0.9);
    assert.equal(edges[3].confidence_in, 0.9);
    assert.equal(edges[4].confidence_in, 0.45);
  });
});

describe('intentHarmFromDelta', () => {
  it('maps negative intent_delta to positive harm', () => {
    assert.equal(intentHarmFromDelta(-0.2), 0.2);
    assert.equal(intentHarmFromDelta(0), 0);
  });
});
