import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConfidenceGate } from './confidence-gate';

describe('evaluateConfidenceGate', () => {
  const hops = [
    { hop_index: 0, from_agent: 'a', confidence_out: 0.9 },
    { hop_index: 1, from_agent: 'b', confidence_out: 0.45 },
    { hop_index: 2, from_agent: 'c', confidence_out: 0.61 },
  ];

  it('passes final mode when last hop meets threshold', () => {
    const r = evaluateConfidenceGate({ acceptLevel: 0.6, mode: 'final', hops });
    assert.equal(r.passed, true);
    assert.equal(r.measured_confidence, 0.61);
  });

  it('fails min mode when weakest hop is below threshold', () => {
    const r = evaluateConfidenceGate({ acceptLevel: 0.68, mode: 'min', hops });
    assert.equal(r.passed, false);
    assert.equal(r.failing_hop?.agent, 'b');
    assert.equal(r.failing_hop?.confidence_out, 0.45);
    assert.match(r.reason, /below the 68%/);
  });

  it('passes min mode when all hops clear threshold', () => {
    const strong = hops.map((h) => ({ ...h, confidence_out: 0.85 }));
    const r = evaluateConfidenceGate({ acceptLevel: 0.78, mode: 'min', hops: strong });
    assert.equal(r.passed, true);
  });
});
