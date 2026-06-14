import React, { useMemo } from 'react';
import type { RunLayout } from '@blamr/types';
import type { RunDetail } from '../types';
import { Badge } from './ui/Badge';
import {
  buildWorkflowTopology,
  layoutDescription,
  layoutLabel,
  shortAgentName,
  type WorkflowTopologyData,
} from '../utils/topology';

interface WorkflowTopologyProps {
  run: Pick<RunDetail, 'layout' | 'trace_hops' | 'agents' | 'edges'>;
  /** full = run detail panel; compact = inline mini diagram */
  variant?: 'full' | 'compact';
}

function layoutBadgeVariant(layout: RunLayout): 'cyn' | 'vi' | 'mu' {
  if (layout === 'parallel') return 'vi';
  if (layout === 'dag') return 'cyn';
  return 'mu';
}

export function LayoutBadge({ layout }: { layout: RunLayout }) {
  return <Badge variant={layoutBadgeVariant(layout)}>{layoutLabel(layout)}</Badge>;
}

function TopologyDiagram({ topology, height = 120 }: { topology: WorkflowTopologyData; height?: number }) {
  const { layers, edges } = topology;
  const width = Math.max(320, layers.length * 108);
  const nodeH = 22;
  const colW = width / Math.max(layers.length, 1);

  const nodePos = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    layers.forEach((layer, colIdx) => {
      const cx = colW * colIdx + colW / 2;
      const n = layer.agents.length;
      layer.agents.forEach((agent, i) => {
        const cy = n <= 1 ? height / 2 : ((i + 1) / (n + 1)) * height;
        pos.set(agent, { x: cx, y: cy });
      });
    });
    return pos;
  }, [layers, colW, height]);

  return (
    <svg
      className="topology-svg"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
    >
      {edges.map((e, i) => {
        const p1 = nodePos.get(e.from);
        const p2 = nodePos.get(e.to);
        if (!p1 || !p2) return null;
        if (e.from === e.to) return null;
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="var(--cy)"
            strokeWidth={0.8 + (e.influence ?? 0) * 1.2}
            opacity={0.35}
            markerEnd="url(#topo-arrow)"
          />
        );
      })}
      <defs>
        <marker id="topo-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="var(--cy)" opacity="0.6" />
        </marker>
      </defs>
      {layers.map((layer) =>
        layer.agents.map((agent) => {
          const p = nodePos.get(agent);
          if (!p) return null;
          const lbl = shortAgentName(agent, 12);
          const w = Math.max(lbl.length * 5.5 + 14, 52);
          return (
            <g key={`${layer.column}-${agent}`}>
              <rect
                x={p.x - w / 2}
                y={p.y - nodeH / 2}
                width={w}
                height={nodeH}
                rx={5}
                fill="rgba(8,145,178,0.1)"
                stroke="rgba(8,145,178,0.45)"
                strokeWidth={1}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--mono)"
                fill="var(--cyL)"
              >
                {lbl}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}

export function WorkflowTopology({ run, variant = 'full' }: WorkflowTopologyProps) {
  const topology = useMemo(
    () => buildWorkflowTopology(run.trace_hops, run.layout, run.agents),
    [run.trace_hops, run.layout, run.agents],
  );

  if (!run.trace_hops.length) {
    if (variant === 'compact') return <LayoutBadge layout={run.layout} />;
    return (
      <div className="topology-panel topology-empty">
        <LayoutBadge layout={run.layout} />
        <span style={{ fontSize: 11, color: 'var(--mu)' }}>Topology appears once edges are ingested.</span>
      </div>
    );
  }

  const parallelLayer = topology.layers.find((l) => l.agents.length > 1);
  const parallelNote =
    topology.layout === 'parallel' && parallelLayer
      ? `${parallelLayer.agents.length} agents at hop ${parallelLayer.hop_index}`
      : topology.maxParallelWidth > 1
        ? `up to ${topology.maxParallelWidth} agents per hop`
        : null;

  if (variant === 'compact') {
    return (
      <div className="topology-compact">
        <LayoutBadge layout={topology.layout} />
        <span className="topology-compact-meta">
          {topology.hopCount} hops · {topology.agentCount} agents
        </span>
      </div>
    );
  }

  return (
    <div className="topology-panel">
      <div className="topology-hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="panel-hdr" style={{ margin: 0 }}>Workflow topology</span>
          <LayoutBadge layout={topology.layout} />
        </div>
        <div className="topology-meta">
          {topology.hopCount} hops · {topology.agentCount} agents
          {parallelNote ? ` · ${parallelNote}` : ''}
        </div>
      </div>
      <p className="topology-desc">{layoutDescription(topology.layout)}</p>
      <TopologyDiagram topology={topology} height={topology.maxParallelWidth > 2 ? 160 : 120} />
      <div className="topology-layers">
        {topology.layers.map((layer) => (
          <div key={layer.column} className="topology-col">
            <div className="topology-col-lbl">Hop {layer.hop_index}</div>
            <div className="topology-col-agents">
              {layer.agents.map((agent) => (
                <span key={agent} className="topology-chip mono">{agent}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
