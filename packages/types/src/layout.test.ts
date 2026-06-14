import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CausalEdge } from './models';
import { inferLayout } from './layout';

function edge(hop: number, from: string, to: string): CausalEdge {
  return {
    id: 'e',
    run_id: 'r',
    workflow_id: 'w',
    workspace_id: 'ws',
    hop_index: hop,
    from_agent: from,
    to_agent: to,
    timestamp_ms: 1,
    confidence_in: 1,
    confidence_out: 0.9,
    intent_delta: 0,
    influence_score: 0.5,
    tokens_in: 0,
    tokens_out: 0,
    latency_ms: 1,
    model: 'm',
    call_type: 'LLM call',
    cost_usd: 0,
    prev_hash: 'a',
    edge_hash: 'b',
  };
}

describe('inferLayout', () => {
  it('returns linear for sequential pipeline', () => {
    const edges = [edge(0, 'a', 'b'), edge(1, 'b', 'c'), edge(2, 'c', 'd')];
    assert.equal(inferLayout(edges), 'linear');
  });

  it('returns parallel when multiple agents share a hop', () => {
    const edges = [
      edge(0, 'intake', 'fork'),
      edge(1, 'sec', 'join'),
      edge(1, 'fin', 'join'),
      edge(1, 'legal', 'join'),
      edge(2, 'synth', 'out'),
    ];
    assert.equal(inferLayout(edges), 'parallel');
  });
});
