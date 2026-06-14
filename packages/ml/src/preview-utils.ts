/** Shared helpers for ML drift classification from hop previews. */
import type { WorkflowDomainType } from '@blamr/types';
import { isIncidentDomain } from '@blamr/types';

export function hasParseableJsonPreview(preview?: string | null): boolean {
  if (!preview) return false;
  const match = preview.match(/\{[\s\S]*\}/);
  if (!match) return false;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** True when output is prose / structured text without a JSON object payload. */
export function isPlainTextPreview(preview?: string | null): boolean {
  if (!preview?.trim()) return false;
  return !hasParseableJsonPreview(preview);
}

export function isIncidentWorkflow(
  workflowId?: string | null,
  domainType?: WorkflowDomainType,
): boolean {
  return isIncidentDomain(workflowId ?? '', domainType ? { domain_type: domainType } : undefined);
}

const HEDGE_RE =
  /\b(might|possibly|uncertain|maybe|perhaps|don't know|cannot verify|not sure|don't have access|do not have access|limited evidence|insufficient)\b/i;

export function outputHasHedging(preview?: string | null): boolean {
  return Boolean(preview && HEDGE_RE.test(preview));
}

function fieldFromPreview(preview: string | undefined, ...keys: string[]): string | undefined {
  if (!preview) return undefined;
  const match = preview.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    for (const key of keys) {
      const v = obj[key];
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Only meaningful when prior hop emitted structured JSON with category/intent/domain fields. */
export function categoriesAligned(inputPreview?: string, priorOutputPreview?: string): boolean {
  if (!hasParseableJsonPreview(priorOutputPreview)) return false;
  const category = fieldFromPreview(priorOutputPreview, 'category', 'intent', 'domain');
  if (!category || !inputPreview) return false;
  return inputPreview.toLowerCase().includes(category.toLowerCase());
}

export function expectsStructuredOutput(priorOutputPreview?: string, inputPreview?: string): boolean {
  return hasParseableJsonPreview(priorOutputPreview) || hasParseableJsonPreview(inputPreview);
}
