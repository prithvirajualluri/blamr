/** Truncate text for causal edge I/O previews (stored in ClickHouse). */
export function previewText(text: string, max = 4000): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}… [truncated]`;
}
