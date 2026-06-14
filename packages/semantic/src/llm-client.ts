/** Local Ollama backend (OpenAI-compatible HTTP API). */

const DEFAULT_BASE_URL = 'http://localhost:11434/v1';

export interface LlmBackend {
  baseUrl: string;
  apiKey: string;
}

export function isLlmBackendConfigured(): boolean {
  return resolveLlmBackend() !== null;
}

export function resolveLlmBackend(): LlmBackend {
  return {
    baseUrl: (process.env.BLAMR_LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ''),
    apiKey: process.env.BLAMR_LLM_API_KEY?.trim() || 'local',
  };
}

export function defaultEmbeddingModel(): string {
  return process.env.BLAMR_EMBEDDING_MODEL?.trim() || 'nomic-embed-text';
}

export function defaultChatModel(): string {
  return process.env.BLAMR_LLM_REASON_MODEL?.trim() || 'llama3.2:3b';
}

export function llmAuthHeaders(backend: LlmBackend): Record<string, string> {
  return {
    Authorization: `Bearer ${backend.apiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Extract JSON object from model output (SLMs may wrap JSON in prose). */
export function parseJsonFromLlm<T>(content: string): T | null {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
