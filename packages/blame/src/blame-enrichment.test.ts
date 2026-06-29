import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { AgentBlame, CausalEdge } from '@blamr/types';
import {
  applyParallelPropagation,
  classifyBlameRole,
  detectFailureMode,
  enrichAgentBlames,
  isEmptyOutputPreview,
  nullOutputFaultBoost,
} from './blame-enrichment';

function edge(partial: Partial<CausalEdge> & Pick<CausalEdge, 'hop_index' | 'from_agent' | 'to_agent'>): CausalEdge {
  return {
    id: `e${partial.hop_index}`,
    run_id: 'run_1',
    workflow_id: 'wf',
    workspace_id: 'ws',
    timestamp_ms: 1,
    confidence_in: 0.9,
    confidence_out: 0.3,
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

describe('null output detection', () => {
  it('detects empty and null previews', () => {
    assert.equal(isEmptyOutputPreview('null'), true);
    assert.equal(isEmptyOutputPreview('{}'), true);
    assert.equal(nullOutputFaultBoost(edge({ hop_index: 0, from_agent: 'a', to_agent: 'b', output_preview: '' })), 1.5);
  });

  it('detects premature termination failure mode', () => {
    const mode = detectFailureMode(edge({ hop_index: 0, from_agent: 'a', to_agent: 'b', output_preview: 'null' }));
    assert.equal(mode, 'inter_agent/premature_termination');
  });

  it('detects context overflow from error text', () => {
    const mode = detectFailureMode(
      edge({
        hop_index: 0,
        from_agent: 'a',
        to_agent: 'b',
        output_preview: 'error: context length exceeded',
      }),
    );
    assert.equal(mode, 'system_design/context_overflow');
  });
});

describe('classifyBlameRole', () => {
  it('marks root as originator on failed runs', () => {
    const role = classifyBlameRole(
      'planner',
      45,
      true,
      true,
      { selfBad: true, upstreamBad: false, isTerminal: false, edge: undefined },
    );
    assert.equal(role, 'originator');
  });

  it('marks terminal upstream-bad agent as manifestor', () => {
    const role = classifyBlameRole(
      'summary',
      20,
      false,
      true,
      { selfBad: true, upstreamBad: true, isTerminal: true, edge: undefined },
    );
    assert.equal(role, 'manifestor');
  });
});

describe('applyParallelPropagation', () => {
  it('shifts weight from bad-input branch to bad-output sibling branch', () => {
    const edges = [
      edge({ id: 'e1', hop_index: 1, from_agent: 'orch', to_agent: 'research', output_preview: 'null' }),
      edge({ id: 'e2', hop_index: 1, from_agent: 'orch', to_agent: 'summary', input_preview: 'null', output_preview: 'bad' }),
    ];
    const weights = new Map<string, number>([
      ['research', 2],
      ['summary', 10],
    ]);
    applyParallelPropagation(edges, weights);
    assert.ok((weights.get('research') ?? 0) > 2);
    assert.ok((weights.get('summary') ?? 0) < 10);
  });
});

describe('enrichAgentBlames', () => {
  it('builds propagation chain for failed runs', () => {
    const agents: AgentBlame[] = [
      { agent: 'planner', blame_pct: 60, is_root: true, reason: 'x', confidence_inflated: false },
      { agent: 'summary', blame_pct: 25, is_root: false, reason: 'y', confidence_inflated: false },
    ];
    const edges = [
      edge({ hop_index: 0, from_agent: 'planner', to_agent: 'planner', output_preview: 'null' }),
      edge({ hop_index: 1, from_agent: 'summary', to_agent: 'summary', input_preview: 'null', output_preview: 'fail' }),
    ];
    const result = enrichAgentBlames(agents, edges, true);
    assert.ok(result.propagation_chain.length >= 1);
    assert.ok(result.agents[0].role);
    assert.equal(result.blame_confidence, 'high');
  });
});
