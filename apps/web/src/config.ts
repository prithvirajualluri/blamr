/** Ingest service base URL (no /v1 suffix). */
export const INGEST_BASE = (import.meta.env.VITE_INGEST_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Full ingest API prefix for agent emitters — not the dashboard API on :3000. */
export const INGEST_ENDPOINT = `${INGEST_BASE}/v1`;

export function buildAgentEnvBlock(apiKey: string): string {
  return `BLAMR_API_KEY=${apiKey}\nBLAMR_ENDPOINT=${INGEST_ENDPOINT}`;
}
