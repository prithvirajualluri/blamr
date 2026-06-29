import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { BlamrTransport, resolveTransportConfig } from './transport';

describe('resolveTransportConfig', () => {
  it('defaults to async non-blocking mode', () => {
    const prev = process.env.BLAMR_SYNC_INGEST;
    delete process.env.BLAMR_SYNC_INGEST;
    assert.equal(resolveTransportConfig().sync, false);
    if (prev) process.env.BLAMR_SYNC_INGEST = prev;
  });
});

describe('BlamrTransport', () => {
  it('enqueue resolves immediately in async mode', async () => {
    const transport = new BlamrTransport('key', 'http://127.0.0.1:9', {
      sync: false,
      disabled: false,
      queueDir: '',
    });
    const start = Date.now();
    await transport.send('/edges', { id: 'e1' });
    assert.ok(Date.now() - start < 50);
    await transport.close();
  });

  it('flush calls fetch in sync mode', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = mock.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 202, text: async () => '' } as Response;
    }) as typeof fetch;

    const transport = new BlamrTransport('key', 'http://localhost:3001/v1', { sync: true });
    await transport.send('/edges', { id: 'e1' });
    assert.equal(calls.length, 1);
    globalThis.fetch = original;
    await transport.close();
  });
});
