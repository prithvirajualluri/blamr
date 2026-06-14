import React, { useMemo, useState, useCallback, useRef } from 'react';
import { FilterChip } from '../components/ui/FilterChip';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { BlamrStatusBadge, BlamrStatusDot } from '../components/BlamrStatusBadge';
import { accCol } from '../utils/format';
import { formatLastSeen } from '../utils/blamr-status';
import { groupRunsByWorkflow, type HeatmapFilter, type HeatmapSort, type RunSummary, type WorkflowMonitorRow } from '../types';

interface MonitorViewProps {
  runs: RunSummary[];
  loading: boolean;
  error: string | null;
  onRunSelect: (id: string) => void;
}

function filterWorkflows(workflows: WorkflowMonitorRow[], filter: HeatmapFilter, sort: HeatmapSort): WorkflowMonitorRow[] {
  let list = workflows.filter((w) => {
    if (filter === 'critical') return w.avgAcc < 0.6;
    if (filter === 'warning') return w.avgAcc >= 0.6 && w.avgAcc < 0.75;
    if (filter === 'healthy') return w.avgAcc >= 0.9;
    return true;
  });
  list = [...list].sort((a, b) => {
    if (sort === 'acc') return a.avgAcc - b.avgAcc;
    if (sort === 'acc-d') return b.avgAcc - a.avgAcc;
    if (sort === 'blame') return b.totalRuns - a.totalRuns;
    return b.totalRuns - a.totalRuns;
  });
  return list;
}

function accColor(v: number): string {
  return accCol(v);
}

export function MonitorView({ runs, loading, error, onRunSelect }: MonitorViewProps) {
  const workflows = useMemo(() => groupRunsByWorkflow(runs), [runs]);
  const [filter, setFilter] = useState<HeatmapFilter>('all');
  const [sort, setSort] = useState<HeatmapSort>('acc-d');
  const [selectedWf, setSelectedWf] = useState<WorkflowMonitorRow | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterWorkflows(workflows, filter, sort), [workflows, filter, sort]);

  const avgAcc = runs.length ? runs.reduce((a, r) => a + r.accuracy, 0) / runs.length : 0;
  const critical = workflows.filter((w) => w.avgAcc < 0.6).length;
  const warning = workflows.filter((w) => w.avgAcc >= 0.6 && w.avgAcc < 0.75).length;
  const healthyPct = workflows.length ? Math.round(((workflows.length - critical) / workflows.length) * 100) : 100;

  const handleCellClick = useCallback((wf: WorkflowMonitorRow, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (wf.realRuns[idx]) onRunSelect(wf.realRuns[idx]);
  }, [onRunSelect]);

  if (loading && !runs.length) {
    return <div className="page-enter" style={{ color: 'var(--muL)', padding: 24 }}>Loading…</div>;
  }

  return (
    <div className="page-enter">
      <ApiBanner error={error} />

      {!runs.length && !loading && (
        <EmptyState title="No workflow runs yet" subtitle="Connect agents and ingest causal edges to populate the monitor." />
      )}

      {runs.length > 0 && (
        <>
          {critical > 0 && (
            <div
              style={{ background: 'var(--reD)', border: '1px solid rgba(220,38,38,.25)', borderLeft: '3px solid var(--re)', borderRadius: 'var(--rad-lg)', padding: '11px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onClick={() => setFilter('critical')}
              role="button"
              tabIndex={0}
            >
              <span style={{ fontSize: 15 }}>⚠</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--reL)' }}>{critical} workflows below 60% accuracy</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--reL)' }}>Filter ›</span>
            </div>
          )}

          <div className="kpi-strip">
            <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setFilter('all')} role="button" tabIndex={0}>
              <div className="kpi-lbl">Platform accuracy</div>
              <div className="kpi-val" style={{ color: accCol(avgAcc) }}>{Math.round(avgAcc * 100)}%</div>
              <div className="kpi-sub">avg · {workflows.length} workflows</div>
            </div>
            <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => setFilter('critical')} role="button" tabIndex={0}>
              <div className="kpi-lbl">Critical (&lt; 60%)</div>
              <div className="kpi-val c-red">{critical}</div>
              <div className="kpi-sub">workflows need attention</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">Total runs</div>
              <div className="kpi-val c-cyn">{runs.length}</div>
              <div className="kpi-sub">ingested runs</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">Workflows</div>
              <div className="kpi-val c-cyn">{workflows.length}</div>
              <div className="kpi-sub">with at least one run</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div className="filter-row" style={{ marginBottom: 0 }}>
              <FilterChip label={`All (${workflows.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
              <FilterChip label={`Critical <60% (${critical})`} active={filter === 'critical'} color="red" onClick={() => setFilter('critical')} />
              <FilterChip label="Warning 60-75%" active={filter === 'warning'} color="amb" onClick={() => setFilter('warning')} />
              <FilterChip label="Healthy >90%" active={filter === 'healthy'} color="grn" onClick={() => setFilter('healthy')} />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--mu)' }}>Sort:</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as HeatmapSort)} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: '1px solid var(--b0)', background: 'var(--bg3)', color: 'var(--wh)' }}>
                <option value="acc">Accuracy ↑</option>
                <option value="acc-d">Accuracy ↓</option>
                <option value="runs">Run count</option>
              </select>
            </div>
          </div>

          <div className="mon-grid">
            <div>
              <div className="sec-hdr">
                <span>Workflow accuracy grid <span style={{ fontWeight: 400, color: 'var(--mu)' }}>{filtered.length} shown</span></span>
              </div>
              <div className="hmap-wrap">
                <div className="wf-rows-scroll" ref={scrollRef}>
                  {filtered.map((wf) => (
                    <div key={wf.id} className={`wf-row${selectedWf?.id === wf.id ? ' sel' : ''}`} onClick={() => setSelectedWf(selectedWf?.id === wf.id ? null : wf)}>
                      <span className="wf-name wf-name-row">
                        <BlamrStatusDot status={wf.blamrStatus} />
                        {wf.name}
                      </span>
                      <div className="wf-cells">
                        {wf.runAccs.map((a, i) => (
                          <button key={i} type="button" className="hcell" style={{ background: accColor(a), opacity: 0.45 + a * 0.55 }} title={`${Math.round(a * 100)}%`} onClick={(e) => handleCellClick(wf, i, e)} />
                        ))}
                      </div>
                      <span className="wf-acc" style={{ color: accColor(wf.avgAcc) }}>{Math.round(wf.avgAcc * 100)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedWf && (
                <div className="drawer">
                  <div className="drawer-hdr">
                    <span className="drawer-title">{selectedWf.name}</span>
                    <BlamrStatusBadge status={selectedWf.blamrStatus} compact />
                    <button type="button" className="close-x" onClick={() => setSelectedWf(null)}>×</button>
                  </div>
                  <div className="mi-row">
                    <div className="mi"><div className="mi-val" style={{ color: accColor(selectedWf.avgAcc) }}>{Math.round(selectedWf.avgAcc * 100)}%</div><div className="mi-lbl">Avg accuracy</div></div>
                    <div className="mi"><div className="mi-val">{selectedWf.totalRuns}</div><div className="mi-lbl">Total runs</div></div>
                    <div className="mi"><div className="mi-val" style={{ fontSize: 12 }}>{formatLastSeen(selectedWf.lastSeenAt)}</div><div className="mi-lbl">Last blamr activity</div></div>
                  </div>
                  {selectedWf.agents.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Agents · blamr connection</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedWf.agents.map((a) => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--b0)' }}>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--wh)' }}>{a.id}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 10, color: 'var(--mu)' }}>{formatLastSeen(a.lastSeenAt)}</span>
                              <BlamrStatusBadge status={a.blamrStatus} compact />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {selectedWf.realRuns.map((id) => {
                      const run = runs.find((r) => r.id === id);
                      return (
                        <button key={id} type="button" className="mono" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', background: run?.status === 'failed' ? 'var(--reD)' : 'var(--grD)', color: run?.status === 'failed' ? 'var(--reL)' : 'var(--grL)', border: `1px solid ${run?.status === 'failed' ? 'rgba(220,38,38,.3)' : 'rgba(5,150,105,.3)'}` }} onClick={() => onRunSelect(id)}>
                          {id}
                          {run && (
                            <span style={{ marginLeft: 6, opacity: 0.75, fontSize: 10 }}>
                              {run.layout === 'linear' ? '→' : run.layout === 'parallel' ? '∥' : '◇'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="rpanel">
              <div className="rcard">
                <div className="rcard-hdr">● Platform health</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700 }}>{healthyPct}%</div>
                  <div style={{ fontSize: 12, color: 'var(--muL)', lineHeight: 1.8 }}>
                    <div>{workflows.length - critical} healthy</div>
                    <div>{critical} critical</div>
                    <div>{warning} warning</div>
                  </div>
                </div>
              </div>
              <div className="rcard">
                <div className="rcard-hdr">Recent failures</div>
                {runs.filter((r) => r.status === 'failed').slice(0, 5).map((r) => (
                  <div key={r.id} className="feed-item" onClick={() => onRunSelect(r.id)} role="button" tabIndex={0}>
                    <div className="feed-dot" style={{ background: 'var(--reL)' }} />
                    <div className="feed-text">{r.title || r.id}</div>
                  </div>
                ))}
                {!runs.some((r) => r.status === 'failed') && (
                  <div style={{ fontSize: 11, color: 'var(--mu)' }}>No failed runs</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
