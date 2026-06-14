import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TraceHop } from '@blamr/types';
import {
  buildGraphEdges,
  buildGraphLayers,
  isVirtualGraphAgent,
  graphHeightForLayers,
} from './topology';

function hop(
  hop_index: number,
  agent: string,
  to_agent: string,
  influence = 0.7,
): TraceHop {
  return {
    hop_index,
    agent,
    to_agent,
    type: 'LLM call',
    model: 'test',
    tokens_in: 0,
    tokens_out: 0,
    ms: 10,
    cost: 0,
    confidence_in: 0.9,
    confidence_out: 0.85,
    intent_delta: -0.02,
    influence_score: influence,
    timestamp_ms: 1,
  };
}

describe('isVirtualGraphAgent', () => {
  const hops = [hop(0, 'intake', 'parallel_review')];
  it('detects target-only routing nodes', () => {
    assert.equal(isVirtualGraphAgent('parallel_review', hops), true);
    assert.equal(isVirtualGraphAgent('intake', hops), false);
  });
});

describe('buildGraphLayers', () => {
  it('excludes virtual nodes and groups parallel hop', () => {
    const hops = [
      hop(0, 'intake', 'parallel_review'),
      hop(1, 'security', 'synthesis', 0.7),
      hop(1, 'finance', 'synthesis', 0.65),
      hop(2, 'synthesis', 'gate'),
    ];
    const layers = buildGraphLayers(hops);
    assert.equal(layers.length, 3);
    assert.deepEqual(layers[0].agents, ['intake']);
    assert.equal(layers[1].agents.length, 2);
    assert.ok(layers[1].agents.includes('security'));
    assert.ok(layers[1].agents.includes('finance'));
  });
});

describe('buildGraphEdges', () => {
  it('fans out from intake to parallel reviewers', () => {
    const hops = [
      hop(0, 'intake', 'parallel_review'),
      hop(1, 'security', 'synthesis'),
      hop(1, 'finance', 'synthesis'),
    ];
    const layers = buildGraphLayers(hops);
    const visible = new Set(layers.flatMap((l) => l.agents));
    const edges = buildGraphEdges(hops, visible);
    assert.ok(edges.some((e) => e.from === 'intake' && e.to === 'security'));
    assert.ok(edges.some((e) => e.from === 'intake' && e.to === 'finance'));
    assert.ok(!edges.some((e) => e.from === e.to));
  });
});

describe('graphHeightForLayers', () => {
  it('scales with parallel width', () => {
    const layers = [{ column: 0, hop_index: 0, agents: ['a'] }, { column: 1, hop_index: 1, agents: ['b', 'c', 'd'] }];
    assert.ok(graphHeightForLayers(layers) >= 240);
  });
});
