import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkflowGate, resolveDomainType } from './workflow-profile';

describe('resolveWorkflowGate', () => {
  it('uses workspace workflow_configs over platform default', () => {
    const r = resolveWorkflowGate('vendor-procurement', {
      workflow_configs: {
        'vendor-procurement': { confidence_accept_level: 0.68, confidence_gate_mode: 'min' },
      },
    });
    assert.equal(r.acceptLevel, 0.68);
    assert.equal(r.mode, 'min');
    assert.equal(r.source, 'workspace_workflow');
  });

  it('event override wins over workspace', () => {
    const r = resolveWorkflowGate(
      'custom-flow',
      { workflow_configs: { 'custom-flow': { confidence_accept_level: 0.8 } } },
      { confidence_accept_level: 0.55 },
    );
    assert.equal(r.acceptLevel, 0.55);
    assert.equal(r.source, 'event');
  });
});

describe('resolveDomainType', () => {
  it('infers incident from workflow id', () => {
    assert.equal(resolveDomainType('incident-triage'), 'incident');
  });

  it('prefers explicit profile domain_type', () => {
    assert.equal(resolveDomainType('foo', { domain_type: 'support' }), 'support');
  });
});
