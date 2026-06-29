const DEFAULT_MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-sonnet-latest': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-haiku-latest': { inputPer1M: 0.8, outputPer1M: 4 },
  'claude-3-opus-latest': { inputPer1M: 15, outputPer1M: 75 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'llama-3.3-70b': { inputPer1M: 0.59, outputPer1M: 0.79 },
  'llama-3.1-70b': { inputPer1M: 0.59, outputPer1M: 0.79 },
  'llama-3.1-8b': { inputPer1M: 0.05, outputPer1M: 0.08 },
  'mixtral-8x7b': { inputPer1M: 0.24, outputPer1M: 0.24 },
  'llama3.2:3b': { inputPer1M: 0, outputPer1M: 0 },
};

function resolvePricing(model: string): { inputPer1M: number; outputPer1M: number } | null {
  if (!model) return null;
  if (DEFAULT_MODEL_PRICING[model]) return DEFAULT_MODEL_PRICING[model];
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(DEFAULT_MODEL_PRICING)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return value;
    }
  }
  if (lower.includes('sonnet')) return { inputPer1M: 3, outputPer1M: 15 };
  if (lower.includes('haiku')) return { inputPer1M: 0.8, outputPer1M: 4 };
  if (lower.includes('opus')) return { inputPer1M: 15, outputPer1M: 75 };
  if (lower.includes('gpt-4o-mini')) return { inputPer1M: 0.15, outputPer1M: 0.6 };
  if (lower.includes('gpt-4')) return { inputPer1M: 2.5, outputPer1M: 10 };
  return null;
}

export function estimateReplayCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const rates = resolvePricing(model);
  if (!rates) return 0;
  const cost = (tokensIn * rates.inputPer1M + tokensOut * rates.outputPer1M) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
