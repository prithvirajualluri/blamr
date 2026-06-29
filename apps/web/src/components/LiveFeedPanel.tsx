import React from 'react';
import type { LiveEvent } from '@blamr/types';
import { liveEventLabel } from '../hooks/useLiveFeed';

interface LiveFeedPanelProps {
  events: LiveEvent[];
  connected: boolean;
  onSelectRun?: (runId: string) => void;
  onClear?: () => void;
  waitingForFirst?: boolean;
}

export function LiveFeedPanel({ events, connected, onSelectRun, onClear, waitingForFirst }: LiveFeedPanelProps) {
  return (
    <div className="rcard live-feed-panel">
      <div className="rcard-hdr live-feed-hdr">
        <span>Live feed</span>
        <span className={`live-feed-dot${connected ? ' on' : ''}`} title={connected ? 'Connected' : 'Disconnected'} />
        {onClear && events.length > 0 && (
          <button type="button" className="btn btn-sm live-feed-clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {!connected && events.length === 0 && (
        <div className="table-muted" style={{ fontSize: 11, padding: '4px 0' }}>
          Connecting to workspace stream…
        </div>
      )}
      {events.map((ev, i) => (
        <div
          key={`${ev.type}-${ev.run_id}-${ev.timestamp_ms}-${i}`}
          className={`feed-item live-feed-item live-${ev.type.replace('.', '-')}`}
          onClick={() => onSelectRun?.(ev.run_id)}
          role={onSelectRun ? 'button' : undefined}
          tabIndex={onSelectRun ? 0 : undefined}
        >
          <div className={`feed-dot feed-dot-${ev.type === 'blame.completed' ? 'fail' : ev.type === 'run.completed' ? 'cy' : 'ok'}`} />
          <div className="feed-text">
            <span className="feed-title">{liveEventLabel(ev)}</span>
            <span className="feed-meta mono">
              {ev.workflow_id ?? 'workflow'} · {ev.type.replace('.', ' ')}
            </span>
          </div>
        </div>
      ))}
      {connected && events.length === 0 && (
        <div className={`table-muted live-feed-waiting${waitingForFirst ? ' pulsing' : ''}`} style={{ fontSize: 11 }}>
          {waitingForFirst ? 'Waiting for first edge…' : 'Waiting for agent telemetry…'}
        </div>
      )}
    </div>
  );
}
