import { INGEST_ENDPOINT } from '../config';

export interface OnboardingTestResult {
  run_id: string;
}

/**
 * Send a minimal test edge + complete from the browser to verify ingest key and URL.
 * Ingest has CORS enabled so this works without a backend proxy.
 */
export async function sendOnboardingTestEdge(apiKey: string): Promise<OnboardingTestResult> {
  const runId = `run_onboarding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const edge = {
    run_id: runId,
    workflow_id: 'onboarding-test',
    from_agent: 'dashboard',
    to_agent: 'onboarding-agent',
    hop_index: 0,
    confidence_in: 1.0,
    confidence_out: 0.95,
    intent_delta: 0,
    influence_score: 0.8,
    tokens_in: 12,
    tokens_out: 24,
    latency_ms: 42,
    model: 'onboarding-test',
    call_type: 'LLM call' as const,
    cost_usd: 0,
    input_preview: 'blamr dashboard connection test',
    output_preview: 'Connection verified — telemetry received.',
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };

  const edgesRes = await fetch(`${INGEST_ENDPOINT}/edges`, {
    method: 'POST',
    headers,
    body: JSON.stringify(edge),
  });

  if (!edgesRes.ok) {
    const text = await edgesRes.text().catch(() => '');
    throw new Error(parseIngestError(text) || `Ingest rejected edge (HTTP ${edgesRes.status})`);
  }

  const edgesBody = (await edgesRes.json()) as { run_id?: string };
  const resolvedRunId = edgesBody.run_id || runId;

  const completeRes = await fetch(`${INGEST_ENDPOINT}/runs/${resolvedRunId}/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ status: 'success' }),
  });

  if (!completeRes.ok) {
    const text = await completeRes.text().catch(() => '');
    throw new Error(parseIngestError(text) || `Failed to complete run (HTTP ${completeRes.status})`);
  }

  return { run_id: resolvedRunId };
}

function parseIngestError(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    /* plain text */
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}
