import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HopLineageRegistry, previewFromValue } from './lineage';

describe('HopLineageRegistry', () => {
  it('detects object-identity sources', () => {
    const reg = new HopLineageRegistry();
    const payload = { answer: 42 };
    reg.register(payload, 'edge_a');
    const sources = reg.detectSources([payload]);
    assert.deepEqual(sources, ['edge_a']);
  });

  it('detects string sources', () => {
    const reg = new HopLineageRegistry();
    reg.register('hello world', 'edge_b');
    assert.deepEqual(reg.detectSources(['hello world']), ['edge_b']);
  });
});

describe('previewFromValue', () => {
  it('truncates long strings', () => {
    const p = previewFromValue('x'.repeat(600));
    assert.ok(p && p.length <= 501);
  });
});
