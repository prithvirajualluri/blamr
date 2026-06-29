export type ReplayProviderName =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'ollama'
  | 'local';

export interface ResolvedProvider {
  name: ReplayProviderName;
  baseUrl: string;
  apiKey: string;
  /** Model id sent to the provider (may differ from edge model for local fallback). */
  effectiveModel: string;
  /** Use Anthropic native /v1/messages instead of OpenAI-compatible chat. */
  useAnthropicNative: boolean;
}

const GROQ_KEYWORDS = ['llama', 'mixtral', 'gemma2-', 'whisper'];
const OPENAI_KEYWORDS = ['gpt', 'o1-', 'o3-', 'o4-', 'text-embedding', 'davinci', 'babbage'];
const ANTHROPIC_KEYWORDS = ['claude'];

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

function matchesAny(model: string, keywords: string[]): boolean {
  const m = model.toLowerCase();
  return keywords.some((kw) => m.includes(kw));
}

function env(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function resolveReplayProvider(model: string, overrideModel?: string): ResolvedProvider {
  const requested = (overrideModel?.trim() || model?.trim() || '').replace(/^unknown$/i, '');
  if (!requested) {
    throw new Error('Cannot replay: hop has no model recorded.');
  }

  const openaiKey = env('OPENAI_API_KEY');
  const anthropicKey = env('ANTHROPIC_API_KEY');
  const groqKey = env('GROQ_API_KEY');
  const localBase = (env('BLAMR_LLM_BASE_URL') || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '');
  const localKey = env('BLAMR_LLM_API_KEY') || 'local';
  const localFallbackModel =
    env('BLAMR_REPLAY_MODEL') || env('BLAMR_LLM_REASON_MODEL') || 'llama3.2:3b';

  if (openaiKey && matchesAny(requested, OPENAI_KEYWORDS)) {
    return {
      name: 'openai',
      baseUrl: OPENAI_BASE_URL,
      apiKey: openaiKey,
      effectiveModel: requested,
      useAnthropicNative: false,
    };
  }

  if (anthropicKey && matchesAny(requested, ANTHROPIC_KEYWORDS)) {
    return {
      name: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: anthropicKey,
      effectiveModel: requested,
      useAnthropicNative: true,
    };
  }

  if (groqKey && matchesAny(requested, GROQ_KEYWORDS)) {
    return {
      name: 'groq',
      baseUrl: GROQ_BASE_URL,
      apiKey: groqKey,
      effectiveModel: requested,
      useAnthropicNative: false,
    };
  }

  if (openaiKey) {
    return {
      name: 'openai',
      baseUrl: OPENAI_BASE_URL,
      apiKey: openaiKey,
      effectiveModel: requested,
      useAnthropicNative: false,
    };
  }

  if (anthropicKey) {
    return {
      name: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: anthropicKey,
      effectiveModel: requested,
      useAnthropicNative: true,
    };
  }

  if (groqKey) {
    return {
      name: 'groq',
      baseUrl: GROQ_BASE_URL,
      apiKey: groqKey,
      effectiveModel: requested,
      useAnthropicNative: false,
    };
  }

  const effectiveModel =
    matchesAny(requested, OPENAI_KEYWORDS) ||
    matchesAny(requested, ANTHROPIC_KEYWORDS) ||
    matchesAny(requested, GROQ_KEYWORDS)
      ? localFallbackModel
      : requested;

  return {
    name: localBase.includes('localhost') || localBase.includes('ollama') ? 'ollama' : 'local',
    baseUrl: localBase,
    apiKey: localKey,
    effectiveModel,
    useAnthropicNative: false,
  };
}

export function providerEnvHint(model: string): string {
  if (matchesAny(model, OPENAI_KEYWORDS)) return 'OPENAI_API_KEY';
  if (matchesAny(model, ANTHROPIC_KEYWORDS)) return 'ANTHROPIC_API_KEY';
  if (matchesAny(model, GROQ_KEYWORDS)) return 'GROQ_API_KEY';
  return 'BLAMR_LLM_BASE_URL (Ollama) or a cloud provider API key';
}
