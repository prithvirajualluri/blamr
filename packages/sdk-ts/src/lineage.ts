/** Object-identity registry for cross-hop data-flow lineage (source_hop_ids). */

const PREVIEW_MAX = 500;

export function truncatePreview(text: string, max = PREVIEW_MAX): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max)}…`;
}

export function previewFromValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? truncatePreview(t) : undefined;
  }
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value);
      return s && s !== '{}' ? truncatePreview(s) : undefined;
    } catch {
      return undefined;
    }
  }
  return truncatePreview(String(value));
}

/** Registry keyed by object identity with string fallback (mirrors VerdictLens source_span_ids). */
export class HopLineageRegistry {
  private readonly objects = new WeakMap<object, string>();
  private readonly strings = new Map<string, string>();
  /** Strong refs so short-lived values are not GC'd before the run ends. */
  private readonly refs: unknown[] = [];

  register(value: unknown, hopId: string): void {
    if (value === null || value === undefined) return;
    if (typeof value === 'object') {
      this.objects.set(value, hopId);
      this.refs.push(value);
    } else if (typeof value === 'string' && value.trim()) {
      this.strings.set(value, hopId);
      this.refs.push(value);
    }
  }

  detectSources(args: unknown[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const arg of args) {
      if (arg !== null && typeof arg === 'object') {
        const id = this.objects.get(arg);
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
      if (typeof arg === 'string') {
        const id = this.strings.get(arg);
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
    }
    return out;
  }
}
