#!/usr/bin/env tsx
/**
 * Run real multi-agent workflows with local Ollama (OpenAI-compatible API).
 *
 *   npm run real              # all workflows
 *   npm run real:support      # customer-support only
 *   npm run real:research     # research-assistant only
 *   npm run real:incident     # incident-triage only
 */
import { loadEnv } from './lib/load-env.js';
loadEnv();
import { requireLlmBackend } from './lib/llm.js';
import { runCustomerSupport } from './workflows/customer-support.js';
import { runResearchAssistant } from './workflows/research-assistant.js';
import { runIncidentTriage } from './workflows/incident-triage.js';
import { runVendorProcurement } from './workflows/vendor-procurement.js';
import type { WorkflowResult } from './lib/workflow-types.js';
import { resolveForceFail } from './lib/failure-tests.js';

type WorkflowName = 'all' | 'support' | 'research' | 'incident' | 'procurement';

function requireApiKey(): string {
  const apiKey = process.env.BLAMR_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set BLAMR_API_KEY in samples/agents/.env (scope: ingest:write) and save the file');
    process.exit(1);
  }
  return apiKey;
}

function parseWorkflowArg(): WorkflowName {
  const arg = process.argv[2]?.toLowerCase();
  if (!arg || arg === 'all') return 'all';
  if (arg === 'support' || arg === 'customer-support') return 'support';
  if (arg === 'research' || arg === 'research-assistant') return 'research';
  if (arg === 'incident' || arg === 'incident-triage') return 'incident';
  if (arg === 'procurement' || arg === 'vendor-procurement') return 'procurement';
  return 'all';
}

async function main() {
  await requireLlmBackend();

  const workflow = parseWorkflowArg();
  const common = {
    apiKey: requireApiKey(),
    endpoint: process.env.BLAMR_ENDPOINT,
    forceFail: resolveForceFail(),
  };

  console.log('blamr sample agents — multi-agent workflows via local Ollama');
  console.log('Dashboard: http://localhost:8080\n');

  const results: WorkflowResult[] = [];

  if (workflow === 'all' || workflow === 'support') {
    results.push(
      await runCustomerSupport({
        ...common,
        userQuery: process.env.SUPPORT_QUERY || 'What is my remaining leave balance for this year?',
        simulateMisroute:
          process.env.BLAMR_FAILURE_TESTS === '1' &&
          process.env.SUPPORT_SIMULATE_MISROUTE === '1',
      }),
    );
  }

  if (workflow === 'all' || workflow === 'research') {
    results.push(
      await runResearchAssistant({
        ...common,
        question:
          process.env.RESEARCH_QUESTION ||
          'How does causal tracing work in multi-agent AI systems and what drives blame attribution?',
      }),
    );
  }

  if (workflow === 'all' || workflow === 'incident') {
    results.push(
      await runIncidentTriage({
        ...common,
        alertText:
          process.env.INCIDENT_ALERT ||
          'CRITICAL: payment-api error rate 42% for 8 minutes, checkout failures across US-East, last deploy 12m ago',
      }),
    );
  }

  if (workflow === 'all' || workflow === 'procurement') {
    results.push(
      await runVendorProcurement({
        ...common,
        request:
          process.env.PROCUREMENT_REQUEST ||
          'Evaluate Acme Analytics Cloud for our EU analytics platform. Budget $9000/mo. SOC2 and EU data residency required.',
        vendorId: process.env.PROCUREMENT_VENDOR || 'acme-analytics',
        budgetUsd: process.env.PROCUREMENT_BUDGET ? Number(process.env.PROCUREMENT_BUDGET) : 9000,
        requiresEuData: process.env.PROCUREMENT_EU !== '0',
        requiresSoc2: process.env.PROCUREMENT_SOC2 !== '0',
      }),
    );
  }

  console.log('── summary ──');
  for (const r of results) {
    console.log(`  ${r.workflowId}: ${r.runId} (${r.status})`);
  }
  console.log('');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
