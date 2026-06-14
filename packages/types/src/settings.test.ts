import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntentDriftThreshold, resolveConfidenceInflationThreshold } from './settings';

describe('resolveIntentDriftThreshold', () => {
  it('uses workspace value when valid', () => {
    assert.equal(resolveIntentDriftThreshold({ intent_drift_threshold: 0.35 }), 0.35);
  });

  it('falls back to default for invalid values', () => {
    assert.equal(resolveIntentDriftThreshold({ intent_drift_threshold: 0 }), 0.2);
    assert.equal(resolveIntentDriftThreshold(null), 0.2);
  });
});

describe('resolveConfidenceInflationThreshold', () => {
  it('uses workspace value when valid', () => {
    assert.equal(resolveConfidenceInflationThreshold({ confidence_inflation_threshold: 0.12 }), 0.12);
  });
});
