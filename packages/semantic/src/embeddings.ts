import * as crypto from 'crypto';
import type { DriftCache } from './cache';
import {
  defaultEmbeddingModel,
  llmAuthHeaders,
  resolveLlmBackend,
} from './llm-client';

const MAX_EMBED_CHARS = 6000;
const EMBED_TIMEOUT_MS = 15_000;

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function normalizePreview(text: string | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_EMBED_CHARS ? trimmed.slice(0, MAX_EMBED_CHARS) : trimmed;
}

export async function embedTexts(
  texts: string[],
  cache: DriftCache,
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const missing: string[] = [];

  for (const text of texts) {
    const cached = await cache.getEmbedding(hashText(text));
    if (cached) result.set(text, cached);
    else missing.push(text);
  }

  if (missing.length > 0) {
    const fetched = await fetchEmbeddings(missing);
    for (let i = 0; i < missing.length; i++) {
      const vec = fetched[i];
      if (!vec) continue;
      result.set(missing[i], vec);
      await cache.setEmbedding(hashText(missing[i]), vec);
    }
  }

  return result;
}

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  const backend = resolveLlmBackend();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const res = await fetch(`${backend.baseUrl}/embeddings`, {
      method: 'POST',
      headers: llmAuthHeaders(backend),
      body: JSON.stringify({
        model: defaultEmbeddingModel(),
        input: texts,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`Embeddings ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };

    const rows = json.data ?? [];
    const ordered: number[][] = new Array(texts.length);
    for (const row of rows) {
      if (row.index === undefined || !row.embedding) continue;
      ordered[row.index] = row.embedding;
    }
    return ordered;
  } finally {
    clearTimeout(timer);
  }
}
