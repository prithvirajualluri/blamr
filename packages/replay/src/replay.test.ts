import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReplayMessages, parseOriginalInput } from './messages';
import { computeLineDiff, computeReplayStatus } from './diff';
import { resolveReplayProvider } from './provider';
import { buildParentContext } from './context';
import type { CausalEdge } from '@blamr/types';

function edge(partial: Partial<CausalEdge> & Pick<CausalEdge, 'hop_index' | 'from_agent'>): CausalEdge {
  return {
    id: partial.id ?? `edge-${partial.hop_index}`,
    run_id: 'run-1',
    workflow_id: 'wf',
    workspace_id: 'ws',
    to_agent: partial.to_agent ?? 'next',
    timestamp_ms: 0,
    confidence_in: 0.8,
    confidence_out: 0.8,
    intent_delta: 0,
    influence_score: 0,
    tokens_in: 100,
    tokens_out: 50,
    latency_ms: 200,
    model: partial.model ?? 'gpt-4o-mini',
    call_type: partial.call_type ?? 'LLM call',
    cost_usd: 0.001,
    prev_hash: '',
    edge_hash: '',
    ...partial,
  };
}

describe('parseOriginalInput', () => {
  it('parses messages JSON', () => {
    const parsed = parseOriginalInput(
      JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    );
    assert.equal(parsed.messages?.length, 1);
    assert.equal(parsed.messages?.[0].content, 'hello');
  });

  it('falls back to raw text', () => {
    const parsed = parseOriginalInput('plain prompt');
    assert.equal(parsed.raw, 'plain prompt');
  });
});

describe('buildReplayMessages', () => {
  it('replaces last user message when input provided', () => {
    const msgs = buildReplayMessages({
      requestInput: 'new prompt',
      originalInputPreview: JSON.stringify({
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'old' },
        ],
      }),
    });
    assert.deepEqual(msgs, [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'new prompt' },
    ]);
  });
});

describe('computeReplayStatus', () => {
  it('detects same output', () => {
    assert.equal(computeReplayStatus('a', 'a', null, null), 'same');
  });

  it('detects improved when error cleared', () => {
    assert.equal(computeReplayStatus(null, 'ok', 'fail', null), 'improved');
  });
});

describe('computeLineDiff', () => {
  it('shows added and removed lines', () => {
    const diff = computeLineDiff('a\nb', 'a\nc');
    assert.ok(diff.some((l) => l.startsWith('- b')));
    assert.ok(diff.some((l) => l.startsWith('+ c')));
  });
});

describe('buildParentContext', () => {
  it('uses source_hop_ids when present', () => {
    const edges = [
      edge({ hop_index: 0, from_agent: 'a', id: 'e0' }),
      edge({ hop_index: 1, from_agent: 'b', id: 'e1' }),
      edge({
        hop_index: 2,
        from_agent: 'c',
        id: 'e2',
        source_hop_ids: ['e1'],
      }),
    ];
    const ctx = buildParentContext(edges, edges[2]);
    assert.equal(ctx.length, 1);
    assert.equal(ctx[0].agent, 'b');
  });
});

describe('resolveReplayProvider', () => {
  it('routes gpt models to openai when key set', () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    try {
      const p = resolveReplayProvider('gpt-4o-mini');
      assert.equal(p.name, 'openai');
      assert.equal(p.effectiveModel, 'gpt-4o-mini');
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  it('falls back to ollama when no cloud keys', () => {
    const keys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY'] as const;
    const saved: Record<string, string | undefined> = {};
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    try {
      const p = resolveReplayProvider('gpt-4o-mini');
      assert.equal(p.name, 'ollama');
      assert.ok(p.baseUrl.includes('11434'));
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});
