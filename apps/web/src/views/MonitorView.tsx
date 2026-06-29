import React, { useEffect, useRef } from 'react';
import { FilterChip } from '../components/ui/FilterChip';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { BlamrStatusDot } from '../components/BlamrStatusBadge';
import { LiveFeedPanel } from '../components/LiveFeedPanel';
import { useLiveFeed } from '../hooks/useLiveFeed';
import { accCol, fC, fT } from '../utils/format';
import { formatDuration } from '../utils/runs';
import { formatLastSeen } from '../utils/blamr-status';
import { formatScaleCount } from '../utils/registry';
import type { PlatformOverview, WorkflowApiRow } from '../api/runs';
import type { RunSummary } from '../types';

type ToastFn = (type: 'info' | 'success' | 'warn' | 'error', message: string) => void;

interface MonitorViewProps {
  metrics: PlatformOverview | null;
  workflows: WorkflowApiRow[];
  workflowsTotal: number;
  wfHealth: string;
  wfSort: string;
  onWfHealthChange: (h: string) => void;
  onWfSortChange: (s: string) => void;
  recentFailures: RunSummary[];
  loading: boolean;
  error: string | null;
  onRunSelect: (id: string) => void;
  onWorkflowSelect: (workflowId: string) => void;
  onViewAllWorkflows: () => void;
  onViewExecutions: (filter?: 'failed') => void;
  onConnect: () => void;
  onOpenWizard?: () => void;
  onToast?: ToastFn;
  onRefreshMetrics?: () => Promise<void>;
  refreshKey?: number;
}

export function MonitorView({
  metrics,
  workflows,
  workflowsTotal,
  wfHealth,
  wfSort,
  onWfHealthChange,
  onWfSortChange,
  recentFailures,
  loading,
  error,
  onRunSelect,
  onWorkflowSelect,
  onViewAllWorkflows,
  onViewExecutions,
  onConnect,
  onOpenWizard,
  onToast,
  onRefreshMetrics,
  refreshKey = 0,
}: MonitorViewProps) {
  const m = metrics;
  const critical = m?.workflows.critical ?? 0;
  const warning = m?.workflows.warning ?? 0;
  const fair = m?.workflows.fair ?? 0;
  const healthy = m?.workflows.healthy ?? 0;
  const healthyPct = m?.workflows.total
    ? Math.round(((healthy + fair) / m.workflows.total) * 100)
    : 100;
  const successPct = m ? Math.round(m.executions.success_rate * 100) : 0;
  const failPct = m && m.executions.total
    ? Math.round((m.executions.failed / m.executions.total) * 100)
    : 0;
  const waitingForFirst = Boolean(m && m.executions.total === 0 && !loading);
  const liveEnabled = Boolean(m && m.executions.total >= 0);
  const { events: liveEvents, connected: liveConnected, clear: clearLive } = useLiveFeed(liveEnabled);
  const seenEdgeRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    seenEdgeRef.current.clear();
  }, [refreshKey]);

  useEffect(() => {
    if (!onToast || !liveEvents.length) return;
    for (const ev of liveEvents) {
      if (ev.type !== 'edge.ingested') continue;
      const key = `${ev.run_id}-${ev.payload.hop_index}-${ev.timestamp_ms}`;
      if (seenEdgeRef.current.has(key)) continue;
      seenEdgeRef.current.add(key);
      onToast('success', `First edge received — hop ${ev.payload.hop_index}`);
      onRefreshMetrics?.().catch(() => {});
      break;
    }
  }, [liveEvents, onToast, onRefreshMetrics]);

  if (loading && !m) {
    return <div className="page-enter view-loading">Loading platform overview…</div>;
  }

  return (
    <div className="page-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">Overview</h1>
          <p className="view-subtitle">Executions, cost, tokens, latency, and platform health</p>
        </div>
      </div>

      <ApiBanner error={error} />

      {waitingForFirst && (
        <>
          <EmptyState
            title="No executions yet"
            subtitle="Connect agents and ingest causal edges to populate the overview."
            actionLabel="Connect agents →"
            onAction={onConnect}
          />
          <div className="waiting-telemetry">
            <span className={`waiting-telemetry-dot${liveConnected ? ' on' : ''}`} />
            <span>{liveConnected ? 'Waiting for first edge…' : 'Connecting to live feed…'}</span>
            {onOpenWizard && (
              <button type="button" className="btn btn-sm waiting-telemetry-cta" onClick={onOpenWizard}>
                Run connection wizard
              </button>
            )}
          </div>
          <div className="mon-grid mon-grid-empty">
            <LiveFeedPanel
              events={liveEvents}
              connected={liveConnected}
              onSelectRun={onRunSelect}
              onClear={clearLive}
              waitingForFirst
            />
          </div>
        </>
      )}

      {m && m.executions.total > 0 && (
        <>
          {critical > 0 && (
            <div className="alert-banner" onClick={() => onWfHealthChange('critical')} role="button" tabIndex={0}>
              <span className="alert-icon">⚠</span>
              <div className="alert-text">
                <strong>{critical} workflows below 60% accuracy</strong>
                <span>Review blame attribution before failures reach users</span>
              </div>
              <span className="alert-action">Filter ›</span>
            </div>
          )}

          <div className="metrics-section-lbl">Volume</div>
          <div className="kpi-strip kpi-strip-4">
            <div className="kpi-card kpi-card-click" onClick={() => onViewExecutions()} role="button" tabIndex={0}>
              <div className="kpi-lbl">Executions</div>
              <div className="kpi-val c-cyn">{formatScaleCount(m.executions.total)}</div>
              <div className="kpi-sub">{successPct}% success rate</div>
            </div>
            <div className="kpi-card kpi-card-click" onClick={onViewAllWorkflows} role="button" tabIndex={0}>
              <div className="kpi-lbl">Workflows</div>
              <div className="kpi-val c-cyn">{formatScaleCount(m.workflows.total)}</div>
              <div className="kpi-sub">{critical} critical</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">Agents</div>
              <div className="kpi-val c-cyn">{formatScaleCount(m.agents.total)}</div>
              <div className="kpi-sub">unique agents</div>
            </div>
            <div className="kpi-card kpi-card-click" onClick={() => onViewExecutions('failed')} role="button" tabIndex={0}>
              <div className="kpi-lbl">Failed runs</div>
              <div className="kpi-val c-red">{formatScaleCount(m.executions.failed)}</div>
              <div className="kpi-sub">{m.executions.running} running</div>
            </div>
          </div>

          <div className="metrics-section-lbl">Cost &amp; performance</div>
          <div className="kpi-strip kpi-strip-4">
            <div className="kpi-card">
              <div className="kpi-lbl">Total cost</div>
              <div className="kpi-val c-go">{fC(m.cost.total_usd)}</div>
              <div className="kpi-sub">{fC(m.cost.avg_per_run)} avg / run</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">Total tokens</div>
              <div className="kpi-val c-vi">{fT(m.tokens.total)}</div>
              <div className="kpi-sub">{fT(Math.round(m.tokens.avg_per_run))} avg / run</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">Avg latency</div>
              <div className="kpi-val">{formatDuration(Math.round(m.latency.avg_ms))}</div>
              <div className="kpi-sub">end-to-end per run</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">Platform accuracy</div>
              <div className="kpi-val" style={{ color: accCol(m.accuracy.avg) }}>
                {Math.round(m.accuracy.avg * 100)}%
              </div>
              <div className="kpi-sub">workspace average</div>
            </div>
          </div>

          <div className="mon-grid">
            <div>
              <div className="panel">
                <div className="panel-hdr">
                  <span>Top workflows by volume</span>
                  <div className="panel-hdr-actions">
                    <select value={wfSort} onChange={(e) => onWfSortChange(e.target.value)} className="select-sm" aria-label="Sort">
                      <option value="runs">By executions</option>
                      <option value="acc">Accuracy ↑</option>
                      <option value="acc-d">Accuracy ↓</option>
                      <option value="recent">Recently active</option>
                    </select>
                  </div>
                </div>
                <div className="filter-row panel-filters">
                  <FilterChip label="All" active={wfHealth === 'all'} onClick={() => onWfHealthChange('all')} />
                  <FilterChip label={`Critical (${critical})`} active={wfHealth === 'critical'} color="red" onClick={() => onWfHealthChange('critical')} />
                  <FilterChip label={`Warning (${warning})`} active={wfHealth === 'warning'} color="amb" onClick={() => onWfHealthChange('warning')} />
                  <FilterChip label={`Fair (${fair})`} active={wfHealth === 'fair'} color="cyn" onClick={() => onWfHealthChange('fair')} />
                  <FilterChip label={`Healthy (${healthy})`} active={wfHealth === 'healthy'} color="grn" onClick={() => onWfHealthChange('healthy')} />
                </div>

                <div className="wf-table wf-table-metrics">
                  <div className="wf-table-head">
                    <span>Workflow</span>
                    <span>Acc</span>
                    <span>Cost</span>
                    <span>Tokens</span>
                    <span>Avg lat</span>
                    <span />
                  </div>
                  {workflows.map((wf) => (
                    <WorkflowOverviewRow key={wf.id} wf={wf} onOpen={() => onWorkflowSelect(wf.id)} />
                  ))}
                  {workflowsTotal > workflows.length && (
                    <button type="button" className="wf-table-more" onClick={onViewAllWorkflows}>
                      View all {formatScaleCount(workflowsTotal)} workflows →
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rpanel">
              <div className="rcard">
                <div className="rcard-hdr">Run outcomes</div>
                <div className="outcome-bar" role="img" aria-label={`Success ${successPct}%, Failed ${failPct}%`}>
                  <div className="outcome-seg outcome-seg-ok" style={{ width: `${successPct}%` }} />
                  <div className="outcome-seg outcome-seg-fail" style={{ width: `${failPct}%` }} />
                </div>
                <div className="outcome-legend">
                  <span><i className="legend-dot gr" /> Success {m.executions.success}</span>
                  <span><i className="legend-dot re" /> Failed {m.executions.failed}</span>
                  {m.executions.running > 0 && (
                    <span><i className="legend-dot cy" /> Running {m.executions.running}</span>
                  )}
                </div>
              </div>

              <div className="rcard">
                <div className="rcard-hdr">Platform health</div>
                <div className="health-row">
                  <div className="health-pct">{healthyPct}%</div>
                  <div className="health-breakdown">
                    <div>{healthy} healthy</div>
                    <div>{fair} fair</div>
                    <div>{warning} warning</div>
                    <div>{critical} critical</div>
                  </div>
                </div>
              </div>

              <LiveFeedPanel
                events={liveEvents}
                connected={liveConnected}
                onSelectRun={onRunSelect}
                onClear={clearLive}
              />

              <div className="rcard">
                <div className="rcard-hdr">Recent failures</div>
                {recentFailures.map((r) => (
                  <div key={r.id} className="feed-item" onClick={() => onRunSelect(r.id)} role="button" tabIndex={0}>
                    <div className="feed-dot feed-dot-fail" />
                    <div className="feed-text">
                      <span className="feed-title">{r.title || r.id}</span>
                      <span className="feed-meta mono">{r.workflow_id} · {fC(r.total_cost_usd)} · {fT(r.total_tokens)} tok</span>
                    </div>
                  </div>
                ))}
                {!recentFailures.length && (
                  <div className="table-muted" style={{ fontSize: 11 }}>No failed runs</div>
                )}
                <button type="button" className="btn btn-sm rcard-link" onClick={() => onViewExecutions('failed')}>
                  All failed executions →
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function WorkflowOverviewRow({
  wf,
  onOpen,
}: {
  wf: WorkflowApiRow;
  onOpen: () => void;
}) {
  return (
    <div className="wf-overview-row" onClick={onOpen} role="button" tabIndex={0}>
      <div className="wf-overview-main">
        <BlamrStatusDot status={wf.blamr_status} />
        <span className="wf-overview-name mono">{wf.name}</span>
        <span className="wf-overview-meta">
          {formatScaleCount(wf.run_count)} runs · {wf.agents.length} agents
          {wf.failed_runs > 0 && <span className="wf-fail-badge"> · {wf.failed_runs} failed</span>}
        </span>
      </div>
      <span className="wf-overview-acc mono" style={{ color: accCol(wf.avg_accuracy) }}>{Math.round(wf.avg_accuracy * 100)}%</span>
      <span className="wf-overview-metric mono">{fC(wf.total_cost_usd)}</span>
      <span className="wf-overview-metric mono">{fT(wf.total_tokens)}</span>
      <span className="wf-overview-metric mono table-muted">{formatDuration(Math.round(wf.avg_duration_ms))}</span>
      <span className="wf-overview-seen table-muted">{formatLastSeen(wf.last_run_at)}</span>
    </div>
  );
}
