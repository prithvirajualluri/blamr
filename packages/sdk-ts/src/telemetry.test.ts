import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichEdgeTelemetry, estimateCostUsd, normalizeCallType, resolveTelemetryConfig } from './telemetry';

describe('enrichEdgeTelemetry', () => {
  const cfg = resolveTelemetryConfig({ enrichMissingUsage: true, attachProviderUsage: true });

  it('estimates tokens and cost from previews when usage missing', () => {
    const enriched = enrichEdgeTelemetry(
      {
        model: 'claude-sonnet-4-6',
        call_type: 'tool_call',
        input_preview: 'a'.repeat(40),
        output_preview: 'b'.repeat(80),
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
      },
      cfg,
      null,
    );
    assert.equal(enriched.tokens_in, 10);
    assert.equal(enriched.tokens_out, 20);
    assert.ok((enriched.cost_usd ?? 0) > 0);
    assert.equal(enriched.call_type, 'LLM call');
  });

  it('prefers provider usage over preview estimates', () => {
    const enriched = enrichEdgeTelemetry(
      {
        model: 'claude-sonnet-4-6',
        input_preview: 'short',
        tokens_in: 0,
        tokens_out: 0,
      },
      cfg,
      {
        model: 'claude-sonnet-4-6',
        tokens_in: 1200,
        tokens_out: 400,
        latency_ms: 900,
        captured_at_ms: Date.now(),
      },
    );
    assert.equal(enriched.tokens_in, 1200);
    assert.equal(enriched.tokens_out, 400);
    assert.equal(enriched.latency_ms, 900);
    assert.ok(Math.abs((enriched.cost_usd ?? 0) - 0.0096) < 0.0001);
  });
});

describe('normalizeCallType', () => {
  it('maps tool_call with model to LLM call', () => {
    assert.equal(normalizeCallType('tool_call', 'claude-sonnet-4-6'), 'LLM call');
  });
});

describe('estimateCostUsd', () => {
  it('computes sonnet pricing', () => {
    assert.equal(
      estimateCostUsd('claude-sonnet-4-6', 1_000_000, 0, resolveTelemetryConfig().modelPricing),
      3,
    );
  });
});
