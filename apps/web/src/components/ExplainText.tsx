import React from 'react';
import { parseExplainText } from '../utils/signal-explain';

export function ExplainText({ text }: { text: string }) {
  const parts = parseExplainText(text);
  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <strong key={i}>{part.bold}</strong>
        ),
      )}
    </>
  );
}
