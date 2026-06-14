import React from 'react';
import { fC, fM, fT } from '../utils/format';
import type { RunDetail } from '../types';
import { explainConfidenceChange, explainIntentPreserved, contextForHop, plainText } from '../utils/signal-explain';

export interface GraphTooltipData {
  x: number;
  y: number;
  agent: string;
}

export function GraphTooltip({ data, run }: { data: GraphTooltipData; run: RunDetail }) {
  const blame = run.blame.find((b) => b.agent === data.agent);
  const conf = run.confidence_trace.find((c) => c.agent === data.agent);
  const intent = run.intent_trace.find((i) => i.agent === data.agent);
  const span = run.spans.find((s) => s.agent === data.agent);
  const traceHop = run.trace_hops.find((h) => h.agent === data.agent);
  const ml = traceHop ? run.hop_analysis.find((h) => h.hop_index === traceHop.hop_index) : undefined;
  const hopCtx = traceHop ? contextForHop(run.trace_hops, traceHop, run.workflow_id, run.workflow_profile?.domain_type) : {};
  const confExplain = traceHop ? explainConfidenceChange(traceHop, ml, hopCtx) : null;
  const intentExplain = traceHop ? explainIntentPreserved(traceHop, ml, hopCtx) : null;
  const pctLabel = run.status === 'failed' ? 'Blame' : 'Contribution';

  return (
    <div id="tt" style={{ display: 'block', left: data.x + 14, top: data.y - 10 }}>
      <div className="ttn">{data.agent}</div>
      <div className="ttr"><span className="ttk">{pctLabel}</span><span>{blame && blame.pct > 0 ? `${blame.pct}%` : '—'}</span></div>
      <div className="ttr"><span className="ttk">Confidence</span><span>{conf ? `${conf.ci.toFixed(2)} → ${conf.co.toFixed(2)}${conf.inflated ? ' ↑' : ''}` : '—'}</span></div>
      <div className="ttr"><span className="ttk">Intent</span><span>{intent ? `${intent.pct}%` : '—'}</span></div>
      {confExplain && (
        <div className="ttr" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span className="ttk">Why conf changed</span>
          <span style={{ fontSize: 10, color: 'var(--mu)', lineHeight: 1.4 }}>{plainText(confExplain.summary)}</span>
        </div>
      )}
      {intentExplain && (
        <div className="ttr" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span className="ttk">Why intent {intentExplain.pct}%</span>
          <span style={{ fontSize: 10, color: 'var(--mu)', lineHeight: 1.4 }}>{plainText(intentExplain.summary)}</span>
        </div>
      )}
      <div className="ttr"><span className="ttk">Tokens</span><span>{span ? `${fT(span.tokens_in)} in / ${fT(span.tokens_out)} out` : '—'}</span></div>
      <div className="ttr"><span className="ttk">Cost</span><span>{span ? fC(span.cost) : '—'}</span></div>
      <div className="ttr"><span className="ttk">Latency</span><span>{span ? fM(span.ms) : '—'}</span></div>
    </div>
  );
}
