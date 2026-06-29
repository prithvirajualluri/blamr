import { useEffect, useRef, useState, useCallback } from 'react';
import type { LiveEvent } from '@blamr/types';
import { API_BASE } from '../types';
import { getStoredToken } from '../auth/storage';

const MAX_EVENTS = 40;

export function useLiveFeed(enabled: boolean) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!enabled) return;
    const token = getStoredToken();
    if (!token) return;

    const url = `${API_BASE}/v1/live/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (msg) => {
      try {
        const raw = JSON.parse(msg.data) as Record<string, unknown>;
        if (raw.type === 'connected') {
          setConnected(true);
          return;
        }
        setEvents((prev) => [raw as unknown as LiveEvent, ...prev].slice(0, MAX_EVENTS));
      } catch {
        /* ignore malformed */
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  return { events, connected, clear };
}

export function liveEventLabel(event: LiveEvent): string {
  switch (event.type) {
    case 'edge.ingested': {
      const p = event.payload;
      return `Hop ${p.hop_index}: ${p.from_agent} → ${p.to_agent}`;
    }
    case 'run.completed':
      return `Run ${event.run_id.slice(-8)} ${event.payload.status ?? ''}`.trim();
    case 'blame.completed': {
      const p = event.payload;
      return `Blame: ${p.root_cause_agent} (${p.root_cause_pct}%)`;
    }
    default:
      return event.type;
  }
}
