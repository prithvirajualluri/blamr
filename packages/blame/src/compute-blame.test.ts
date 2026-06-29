import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { CausalEdge } from '@blamr/types';
import { applyLineageWeights, collapseRetryStorms } from './compute-blame';

function edge(partial: Partial<CausalEdge> & Pick<CausalEdge, 'id' | 'hop_index' | 'from_agent' | 'to_agent'>): CausalEdge {
  return {
    run_id: 'run_1',
    workflow_id: 'wf',
    workspace_id: 'ws',
    timestamp_ms: 1,
    confidence_in: 0.9,
    confidence_out: 0.5,
    intent_delta: -0.3,
    influence_score: 0.8,
    tokens_in: 0,
    tokens_out: 0,
    latency_ms: 10,
    model: 'm',
    call_type: 'Tool call',
    cost_usd: 0,
    prev_hash: '',
    edge_hash: '',
    ...partial,
  };
}

describe('collapseRetryStorms', () => {
  it('keeps first hop when 3+ identical retries', () => {
    const base = {
      from_agent: 'orchestrator',
      to_agent: 'worker',
      output_preview: 'timeout',
      confidence_out: 0.2,
    };
    const edges = [0, 1, 2, 3].map((i) =>
      edge({ id: `e${i}`, hop_index: i, ...base }),
    );
    const out = collapseRetryStorms(edges);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'e0');
  });
});

describe('applyLineageWeights', () => {
  it('shifts weight to upstream source hop agent', () => {
    const edges = [
      edge({ id: 'src', hop_index: 0, from_agent: 'planner', to_agent: 'planner' }),
      edge({
        id: 'down',
        hop_index: 1,
        from_agent: 'orchestrator',
        to_agent: 'summary',
        source_hop_ids: ['src'],
      }),
    ];
    const weights = new Map<string, number>([
      ['orchestrator', 10],
      ['planner', 1],
    ]);
    applyLineageWeights(edges, weights);
    assert.ok((weights.get('planner') ?? 0) > 1);
    assert.ok((weights.get('orchestrator') ?? 0) < 10);
  });
});
