import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const agentsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Load repo root .env then samples/agents/.env (local file overrides). */
export function loadEnv(): void {
  dotenv.config({ path: resolve(agentsDir, '../../.env') });
  dotenv.config({ path: resolve(agentsDir, '.env'), override: true });
}

export function envStatus(): Record<string, 'ok' | 'empty'> {
  const keys = ['BLAMR_API_KEY', 'BLAMR_LLM_BASE_URL'] as const;
  return Object.fromEntries(
    keys.map((k) => [k, process.env[k]?.trim() ? 'ok' : 'empty']),
  ) as Record<(typeof keys)[number], 'ok' | 'empty'>;
}
