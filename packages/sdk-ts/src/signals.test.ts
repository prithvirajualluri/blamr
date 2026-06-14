import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeConfidenceOut,
  intentDeltaFromRelevance,
  alignmentCeiling,
} from './signals';

describe('computeConfidenceOut', () => {
  it('caps confidence by alignment ceiling from intent delta', () => {
    const out = computeConfidenceOut({
      text: '{"confidence": 0.95}',
      confidenceIn: 0.9,
      intentDelta: -0.35,
    });
    assert.ok(out <= alignmentCeiling(-0.35) + 0.001);
  });

  it('uses tool score when provided', () => {
    const out = computeConfidenceOut({ toolScore: 0.45, confidenceIn: 0.9 });
    assert.equal(out, 0.45);
  });
});

describe('intentDeltaFromRelevance', () => {
  it('returns mild delta for high relevance', () => {
    assert.equal(intentDeltaFromRelevance(0.8), -0.02);
  });

  it('returns strong delta for low relevance', () => {
    assert.equal(intentDeltaFromRelevance(0.2), -0.35);
  });
});
