import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { wrapClient } from './index';

describe('wrapClient', () => {
  it('auto-extracts the first system prompt and sends run metadata once', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = mock.fn(async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {},
      });
      return {
        ok: true,
        status: 202,
        text: async () => '',
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    const client = {
      chat: {
        completions: {
          create: async (..._args: unknown[]) => ({
            model: 'gpt-4o',
            usage: { prompt_tokens: 10, completion_tokens: 5 },
            choices: [{ message: { content: 'done' } }],
          }),
        },
      },
    };

    const wrapped = wrapClient(client, {
      workflowId: 'wf',
      agentId: 'agent',
      apiKey: 'key',
      endpoint: 'http://localhost:3001/v1',
      transport: { sync: true, queueDir: '' },
    });

    await wrapped.chat.completions.create({
      messages: [
        { role: 'system', content: 'Always answer with PTO policy guidance.' },
        { role: 'user', content: 'How many leave days remain?' },
      ],
    });
    await wrapped.blamr.completeRun();

    const metadataCall = requests.find((req) => req.url.endsWith('/metadata'));
    assert.ok(metadataCall);
    assert.equal(metadataCall?.method, 'PUT');
    assert.equal(metadataCall?.body.system_prompt, 'Always answer with PTO policy guidance.');
    assert.equal(metadataCall?.body.workflow_id, 'wf');
    assert.equal(
      requests.filter((req) => req.url.endsWith('/metadata')).length,
      1,
    );

    globalThis.fetch = originalFetch;
  });
});
