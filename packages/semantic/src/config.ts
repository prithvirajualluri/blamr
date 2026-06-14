import { isLlmBackendConfigured } from './llm-client';

export function isSemanticDriftEnabled(): boolean {
  const flag = process.env.BLAMR_SEMANTIC_DRIFT?.trim().toLowerCase();
  const configured = isLlmBackendConfigured();
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return configured;
  return configured;
}

export function isLlmBlameReasonEnabled(): boolean {
  const flag = process.env.BLAMR_LLM_BLAME_REASON?.trim().toLowerCase();
  const configured = isLlmBackendConfigured();
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return configured;
  return configured;
}

export function semanticSettleMs(): number {
  const raw = process.env.BLAMR_SEMANTIC_SETTLE_MS?.trim();
  if (raw === '0') return 0;
  const parsed = raw ? parseInt(raw, 10) : 2000;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2000;
}
