#!/usr/bin/env tsx
/**
 * Run workflows designed to fail — for testing blame, failed runs filter, monitor alerts.
 *
 *   npm run fail:all          # all three failure scenarios
 *   npm run fail:support      # HR policy misroute (deterministic)
 *   npm run fail:research     # KB miss
 *   npm run fail:incident     # security under-severity
 *   BLAMR_FORCE_FAIL=1 npm run real:support   # full trace, forced failed status
 */
import { loadEnv } from './lib/load-env.js';
loadEnv();
import { requireLlmBackend } from './lib/llm.js';
import { runCustomerSupport } from './workflows/customer-support.js';
import { runResearchAssistant } from './workflows/research-assistant.js';
import { runIncidentTriage } from './workflows/incident-triage.js';
import type { WorkflowResult } from './lib/workflow-types.js';
import { requireFailureTestsEnabled } from './lib/failure-tests.js';

type FailMode = 'all' | 'support' | 'research' | 'incident';

const FAIL_QUERIES = {
  support:
    'What is my remaining PTO leave balance for this year?',
  research:
    'Explain the zk-SNARK prover optimization used in blamr quantum mesh protocol v99',
  incident:
    'SECURITY: Possible credential stuffing — 3 failed logins from single IP, no outage, no customer tickets',
} as const;

function requireApiKey(): string {
  const apiKey = process.env.BLAMR_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set BLAMR_API_KEY in samples/agents/.env');
    process.exit(1);
  }
  return apiKey;
}

function parseMode(): FailMode {
  const arg = process.argv[2]?.toLowerCase();
  if (!arg || arg === 'all') return 'all';
  if (arg === 'support') return 'support';
  if (arg === 'research') return 'research';
  if (arg === 'incident') return 'incident';
  return 'all';
}

async function main() {
  requireFailureTestsEnabled('Failure test runs');
  await requireLlmBackend();
  const mode = parseMode();
  const common = { apiKey: requireApiKey(), endpoint: process.env.BLAMR_ENDPOINT };
  const results: WorkflowResult[] = [];

  console.log('blamr failure test runs — expect FAILED status in dashboard\n');

  if (mode === 'all' || mode === 'support') {
    results.push(
      await runCustomerSupport({
        ...common,
        userQuery: process.env.SUPPORT_QUERY || FAIL_QUERIES.support,
        simulateMisroute: true,
      }),
    );
  }

  if (mode === 'all' || mode === 'research') {
    results.push(
      await runResearchAssistant({
        ...common,
        question: process.env.RESEARCH_QUESTION || FAIL_QUERIES.research,
      }),
    );
  }

  if (mode === 'all' || mode === 'incident') {
    results.push(
      await runIncidentTriage({
        ...common,
        alertText: process.env.INCIDENT_ALERT || FAIL_QUERIES.incident,
      }),
    );
  }

  console.log('── failure test summary ──');
  for (const r of results) {
    console.log(`  ${r.workflowId}: ${r.runId} (${r.status})${r.errorSummary ? ` — ${r.errorSummary}` : ''}`);
  }
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(`\n${failed}/${results.length} failed → check http://localhost:8080 → Runs → Failed\n`);
  if (failed === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
