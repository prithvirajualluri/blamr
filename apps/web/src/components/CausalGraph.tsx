import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { RunDetail } from '../types';
import { GraphTooltip, type GraphTooltipData } from './GraphTooltip';
import { Badge } from './ui/Badge';
import { RunTraceBadge } from './BlamrStatusBadge';
import { LayoutBadge } from './WorkflowTopology';
import { explainHopSignals, contextForHop } from '../utils/signal-explain';
import { ExplainText } from './ExplainText';
import {
  buildGraphEdges,
  buildGraphLayers,
  buildWorkflowTopology,
  computeNodePositions,
  graphHeightForLayers,
  shortAgentName,
} from '../utils/topology';

interface CausalGraphProps {
  run: RunDetail;
}

const NODE_R = 23;

export function CausalGraph({ run }: CausalGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(700);
  const [tooltip, setTooltip] = useState<GraphTooltipData | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const graphLayers = useMemo(() => buildGraphLayers(run.trace_hops), [run.trace_hops]);
  const topology = useMemo(
    () => buildWorkflowTopology(run.trace_hops, run.layout, run.agents),
    [run.trace_hops, run.layout, run.agents],
  );
  const height = graphHeightForLayers(graphLayers);
  const graphAgents = useMemo(() => graphLayers.flatMap((l) => l.agents), [graphLayers]);
  const visibleAgents = useMemo(() => new Set(graphAgents), [graphAgents]);
  const graphEdges = useMemo(
    () => buildGraphEdges(run.trace_hops, visibleAgents),
    [run.trace_hops, visibleAgents],
  );

  const rootAgent = run.blame.find((b) => b.root)?.agent ?? run.blame[0]?.agent;
  const isSucc = run.status === 'success';
  const maxMs = Math.max(...run.spans.map((s) => s.ms), 1);
  const maxC = Math.max(...run.spans.map((s) => s.cost), 0.000001);
  const markerSuffix = run.id.replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth - 32;
      setWidth(w < 200 ? 700 : w);
    });
    ro.observe(el);
    setWidth(Math.max(el.offsetWidth - 32, 200));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSelectedAgent(null);
  }, [run.id]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (svgRef.current) svgRef.current.style.opacity = '1';
    });
  }, [run.id, width, height]);

  const pos = useMemo(
    () => computeNodePositions(graphLayers, width, height),
    [graphLayers, width, height],
  );

  const showPanel = useCallback((agent: string) => {
    setSelectedAgent(agent);
  }, []);

  const selectedBlame = selectedAgent ? run.blame.find((b) => b.agent === selectedAgent) : null;
  const selectedConf = selectedAgent ? run.confidence_trace.find((c) => c.agent === selectedAgent) : null;
  const selectedIntent = selectedAgent ? run.intent_trace.find((i) => i.agent === selectedAgent) : null;
  const selectedSpan = selectedAgent ? run.spans.find((s) => s.agent === selectedAgent) : null;
  const selectedTraceHop = selectedAgent ? run.trace_hops.find((h) => h.agent === selectedAgent) : undefined;
  const selectedMl = selectedTraceHop
    ? run.hop_analysis.find((h) => h.hop_index === selectedTraceHop.hop_index)
    : undefined;
  const signalExplain = useMemo(() => {
    if (!selectedTraceHop) return null;
    const hopCtx = contextForHop(run.trace_hops, selectedTraceHop, run.workflow_id, run.workflow_profile?.domain_type);
    return explainHopSignals(selectedTraceHop, selectedMl, {
      ...hopCtx,
      isSuccess: isSucc,
      contributionPct: selectedBlame?.pct,
      blameReason: selectedBlame?.reason,
    });
  }, [selectedTraceHop, selectedMl, isSucc, selectedBlame?.pct, selectedBlame?.reason, run.trace_hops, run.workflow_id, run.workflow_profile?.domain_type]);
  const isRootSelected = !isSucc && selectedBlame?.root;

  if (!run.trace_hops.length) {
    return (
      <div className="graph-box">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wh)', marginBottom: 8 }}>Causal execution graph</div>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>No edge data yet — graph appears once hops are ingested.</div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div className="graph-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wh)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Causal execution graph
            <LayoutBadge layout={topology.layout} />
          </div>
          <div className="graph-legend">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--re)', display: 'inline-block' }} />
              Root cause
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--go)', display: 'inline-block' }} />
              High blame
            </span>
            <span style={{ fontSize: 10, color: 'var(--mu)' }}>Orange ring = cost · bar = latency</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 8 }}>
          Click any node to inspect · Hover for quick stats · {graphAgents.length} agents · {graphLayers.length} hops
        </div>
        <svg
          ref={svgRef}
          className="causal-graph-svg"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ opacity: 0, transition: 'opacity 0.2s' }}
        >
          <defs>
            <marker id={`arR-${markerSuffix}`} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#DC2626" opacity="0.85" />
            </marker>
            <marker id={`arG-${markerSuffix}`} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#2A4070" opacity="0.8" />
            </marker>
            <marker id={`arGr-${markerSuffix}`} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#059669" opacity="0.8" />
            </marker>
          </defs>

          {graphEdges.map((e, i) => {
            const p1 = pos[e.from];
            const p2 = pos[e.to];
            if (!p1 || !p2) return null;
            const isBlame = !isSucc && (e.from === rootAgent || e.to === rootAgent);
            const sc = isBlame ? '#DC2626' : isSucc ? '#059669' : '#2A4070';
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const x1 = p1.x + (dx / dist) * NODE_R;
            const y1 = p1.y + (dy / dist) * NODE_R;
            const x2 = p2.x - (dx / dist) * (NODE_R + 4);
            const y2 = p2.y - (dy / dist) * (NODE_R + 4);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const curve = Math.abs(dy) > 20 ? `M${x1},${y1} Q${midX},${midY} ${x2},${y2}` : null;

            return (
              <g key={`${e.from}-${e.to}-${i}`}>
                {curve ? (
                  <path
                    d={curve}
                    fill="none"
                    stroke={sc}
                    strokeWidth={0.7 + e.influence * 2.4}
                    opacity={isBlame ? 0.85 : 0.45}
                    markerEnd={`url(#${isBlame ? `arR-${markerSuffix}` : isSucc ? `arGr-${markerSuffix}` : `arG-${markerSuffix}`})`}
                  />
                ) : (
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={sc}
                    strokeWidth={0.7 + e.influence * 2.4}
                    opacity={isBlame ? 0.85 : 0.45}
                    markerEnd={`url(#${isBlame ? `arR-${markerSuffix}` : isSucc ? `arGr-${markerSuffix}` : `arG-${markerSuffix}`})`}
                  />
                )}
                <text
                  x={midX}
                  y={midY - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill={isBlame ? '#DC2626' : isSucc ? '#059669' : '#64748B'}
                  opacity={0.8}
                >
                  {e.influence.toFixed(2)}
                </text>
              </g>
            );
          })}

          {graphAgents.map((a) => {
            const p = pos[a];
            if (!p) return null;
            const bd = run.blame.find((b) => b.agent === a);
            const sp = run.spans.find((s) => s.agent === a);
            const traceHop = run.trace_hops.find((h) => h.agent === a);
            const pct = bd?.pct ?? 0;
            const isRoot = !isSucc && a === rootAgent;
            const isHigh = !isSucc && pct > 20 && !isRoot;
            const fill = isRoot ? 'rgba(220,38,38,0.18)' : isHigh ? 'rgba(215,119,6,0.1)' : isSucc ? 'rgba(5,150,105,0.08)' : 'rgba(8,145,178,0.08)';
            const stk = isRoot ? '#DC2626' : isHigh ? '#D97706' : isSucc ? '#059669' : '#1E3050';
            const tc = isRoot ? '#FCA5A5' : isHigh ? '#FCD34D' : isSucc ? '#34D399' : '#94A3B8';
            const rad = isRoot ? 27 : NODE_R;
            const lbl = shortAgentName(a, 11);
            const cr = sp && sp.cost > 0 && maxC > 0 ? rad + 3 + Math.round((sp.cost / maxC) * 4) : 0;
            const fw = sp && maxMs > 0 ? Math.round((sp.ms / maxMs) * 28) : 0;
            const labelBelow = p.y + rad + 14;

            return (
              <g
                key={a}
                className="gnode"
                style={{ cursor: 'pointer' }}
                onClick={() => showPanel(a)}
                onMouseEnter={(ev) => setTooltip({ x: ev.clientX, y: ev.clientY, agent: a })}
                onMouseMove={(ev) => setTooltip({ x: ev.clientX, y: ev.clientY, agent: a })}
                onMouseLeave={() => setTooltip(null)}
              >
                {isRoot && (
                  <circle cx={p.x} cy={p.y} r={rad + 7} fill="none" stroke="#DC2626" strokeWidth="1" opacity="0.25" strokeDasharray="4 3" />
                )}
                {cr > 0 && (
                  <circle cx={p.x} cy={p.y} r={cr} fill="none" stroke="#D97706" strokeWidth="1.5" opacity={0.1 + (sp!.cost / maxC) * 0.4} strokeDasharray="3 2" />
                )}
                <circle cx={p.x} cy={p.y} r={rad} fill={fill} stroke={stk} strokeWidth={isRoot ? 2 : 1} />
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontFamily="monospace" fontSize={lbl.length > 9 ? 8 : 9} fill={tc}>
                  {lbl}
                </text>
                {traceHop && (
                  <text x={p.x} y={p.y - rad - 8} textAnchor="middle" fontSize="8" fill="var(--mu)" opacity={0.85}>
                    hop {traceHop.hop_index}
                  </text>
                )}
                {pct > 0 && !isSucc && (
                  <text x={p.x} y={labelBelow} textAnchor="middle" fontSize="9" fill={isRoot ? '#DC2626' : isHigh ? '#D97706' : '#64748B'} fontWeight={isRoot ? 'bold' : 'normal'}>
                    {pct}%
                  </text>
                )}
                {isRoot && (
                  <text x={p.x} y={p.y - rad - 18} textAnchor="middle" fontSize="8" fill="#DC2626" fontWeight="bold">ROOT CAUSE</text>
                )}
                {isSucc && (
                  <text x={p.x} y={labelBelow} textAnchor="middle" fontSize="9" fill="#34D399">✓</text>
                )}
                {sp && maxMs > 0 && (
                  <>
                    <rect x={p.x - 14} y={labelBelow + (pct > 0 && !isSucc ? 10 : 4)} width={28} height={2} fill="#1E3050" rx="1" />
                    <rect x={p.x - 14} y={labelBelow + (pct > 0 && !isSucc ? 10 : 4)} width={fw} height={2} fill={sp.ms / maxMs > 0.7 ? '#D97706' : '#0891B2'} rx="1" />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {tooltip && <GraphTooltip data={tooltip} run={run} />}

      {selectedAgent && (
        <div className={`ag-panel${isRootSelected ? ' root' : isSucc ? ' success-ag' : ''}`}>
          <div className="ag-title">
            {isSucc && <span style={{ color: 'var(--grL)' }}>✓ </span>}
            {selectedAgent}
            <RunTraceBadge tracing={Boolean(selectedSpan)} />
            {isRootSelected && <Badge variant="red">Root cause</Badge>}
            {isSucc && <Badge variant="grn">Healthy</Badge>}
          </div>
          {selectedBlame && selectedBlame.pct > 0 && (
            <div className="kv">
              <span className="kvk">{isSucc ? 'Contribution' : 'Blame'}</span>
              <span className="kvv" style={{ color: isRootSelected ? 'var(--reL)' : isSucc ? 'var(--cyL)' : selectedBlame.pct > 20 ? 'var(--goL)' : 'var(--muL)' }}>
                {selectedBlame.pct}%
              </span>
            </div>
          )}
          {selectedConf && (
            <div className="kv">
              <span className="kvk">Confidence in/out</span>
              <span className="kvv" style={{ color: selectedConf.inflated ? 'var(--reL)' : 'var(--muL)' }}>
                {selectedConf.ci.toFixed(2)} → {selectedConf.co.toFixed(2)}{selectedConf.inflated ? ' ↑' : ''}
              </span>
            </div>
          )}
          {selectedIntent && (
            <div className="kv">
              <span className="kvk">Intent preserved</span>
              <span className="kvv" style={{ color: selectedIntent.pct < 50 ? 'var(--reL)' : selectedIntent.pct < 75 ? 'var(--goL)' : 'var(--grL)' }}>
                {selectedIntent.pct}%
              </span>
            </div>
          )}
          {signalExplain && (
            <>
              <div className="ag-justify">
                <div className="ag-justify-title">Why confidence changed</div>
                <div><ExplainText text={signalExplain.confidenceSummary} /></div>
                {signalExplain.confidenceFactors.length > 0 && (
                  <ul>
                    {signalExplain.confidenceFactors.map((f) => (
                      <li key={f}><ExplainText text={f} /></li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="ag-justify">
                <div className="ag-justify-title">Why intent is {signalExplain.intentPct}%</div>
                <div><ExplainText text={signalExplain.intentSummary} /></div>
                <ul>
                  {signalExplain.intentFactors.map((f) => (
                    <li key={f}><ExplainText text={f} /></li>
                  ))}
                </ul>
              </div>
              {signalExplain.contributionNote && (
                <div className="ag-justify" style={{ background: 'rgba(5, 150, 105, 0.06)', borderColor: 'rgba(5, 150, 105, 0.15)' }}>
                  <div className="ag-justify-title" style={{ color: 'var(--grL)' }}>Contribution</div>
                  <div><ExplainText text={signalExplain.contributionNote} /></div>
                </div>
              )}
            </>
          )}
          {selectedSpan && (
            <>
              <div className="kv"><span className="kvk">Model</span><span className="kvv c-vi">{selectedSpan.model}</span></div>
              <div className="kv"><span className="kvk">Tokens in / out</span><span className="kvv">{selectedSpan.tokens_in} / {selectedSpan.tokens_out}</span></div>
              <div className="kv"><span className="kvk">Cost</span><span className="kvv c-amb">${selectedSpan.cost.toFixed(4)}</span></div>
              <div className="kv"><span className="kvk">Latency</span><span className="kvv c-cyn">{selectedSpan.ms}ms</span></div>
              <div className="kv"><span className="kvk">Call type</span><span className="kvv">{selectedSpan.type}</span></div>
            </>
          )}
          {selectedBlame?.reason ? (
            <div className="ag-reason">{selectedBlame.reason}</div>
          ) : isSucc ? (
            <div className="ag-reason" style={{ color: 'var(--grL)' }}>Agent completed successfully. No causal failures detected.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
