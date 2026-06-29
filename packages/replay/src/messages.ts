import type { HopLlmReplayMessage } from '@blamr/types';

export interface ParsedOriginalInput {
  messages?: HopLlmReplayMessage[];
  raw?: string;
}

export function parseOriginalInput(inputPreview?: string): ParsedOriginalInput {
  if (!inputPreview?.trim()) return {};
  const trimmed = inputPreview.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.messages)) {
        const messages = obj.messages
          .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
          .map((m) => ({
            role: normalizeRole(String(m.role ?? 'user')),
            content: String(m.content ?? ''),
          }))
          .filter((m) => m.content.length > 0);
        if (messages.length > 0) return { messages };
      }
      if (typeof obj.content === 'string') return { raw: obj.content };
      if (typeof obj.input === 'string') return { raw: obj.input };
      if (typeof obj.prompt === 'string') return { raw: obj.prompt };
    }
  } catch {
    /* plain text */
  }
  return { raw: trimmed };
}

function normalizeRole(role: string): HopLlmReplayMessage['role'] {
  if (role === 'system' || role === 'assistant') return role;
  return 'user';
}

export function buildReplayMessages(params: {
  requestInput?: string;
  requestMessages?: HopLlmReplayMessage[];
  originalInputPreview?: string;
}): HopLlmReplayMessage[] {
  if (params.requestMessages?.length) {
    return params.requestMessages.map((m) => ({
      role: normalizeRole(m.role),
      content: m.content,
    }));
  }

  const original = parseOriginalInput(params.originalInputPreview);
  const newContent = params.requestInput?.trim();

  if (original.messages?.length) {
    const msgs = original.messages.map((m) => ({ ...m }));
    if (newContent) {
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        if (msgs[i].role === 'user') {
          msgs[i] = { ...msgs[i], content: newContent };
          return msgs;
        }
      }
      msgs.push({ role: 'user', content: newContent });
    }
    return msgs;
  }

  const content = newContent || original.raw || params.originalInputPreview?.trim() || '';
  if (!content) {
    throw new Error('Replay requires input: provide input or messages in the request body.');
  }
  return [{ role: 'user', content }];
}

export function serializeNewInput(
  messages: HopLlmReplayMessage[],
  requestInput?: string,
): string {
  if (requestInput?.trim()) return requestInput.trim();
  if (messages.length === 1 && messages[0].role === 'user') return messages[0].content;
  return JSON.stringify({ messages }, null, 2);
}
