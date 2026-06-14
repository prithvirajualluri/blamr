import React, { useMemo } from 'react';
import { FilterChip } from '../components/ui/FilterChip';
import { Badge } from '../components/ui/Badge';
import { BlamrStatusBadge } from '../components/BlamrStatusBadge';
import { LayoutBadge } from '../components/WorkflowTopology';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { accCol, fC, fT } from '../utils/format';
import { formatDuration, formatRunTimestamp } from '../utils/runs';
import { computeBlamrStatus } from '../utils/blamr-status';
import type { RunFilter, RunSummary } from '../types';
import { groupRunsByWorkflow } from '../types';
import { IconClock, IconUsers, IconTok, IconDollar, IconWarn } from '../components/icons';

interface RunsListViewProps {
  runs: RunSummary[];
  loading: boolean;
  error: string | null;
  filter: RunFilter;
  search: string;
  onRunSelect: (id: string) => void;
  onFilterChange: (f: RunFilter) => void;
}

export function RunsListView({ runs, loading, error, filter, search, onRunSelect, onFilterChange }: RunsListViewProps) {
  const filtered = useMemo(() => {
    let list = [...runs];
    if (filter === 'failed') list = list.filter((r) => r.status === 'failed');
    if (filter === 'success') list = list.filter((r) => r.status === 'success');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.workflow_id.toLowerCase().includes(q) ||
          (r.error?.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [runs, filter, search]);

  const failedCount = runs.filter((r) => r.status === 'failed').length;
  const successCount = runs.filter((r) => r.status === 'success').length;
  const wfBlamrStatus = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeBlamrStatus>>();
    for (const wf of groupRunsByWorkflow(runs)) m.set(wf.id, wf.blamrStatus);
    return m;
  }, [runs]);

  if (loading && !runs.length) {
    return <div className="page-enter" style={{ color: 'var(--muL)', padding: 24 }}>Loading…</div>;
  }

  return (
    <div className="page-enter">
      <ApiBanner error={error} />

      <div style={{ display: 'flex', gap: 7, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <FilterChip label={`All (${runs.length})`} active={filter === 'all'} onClick={() => onFilterChange('all')} />
        <FilterChip label={`Failed (${failedCount})`} active={filter === 'failed'} color="red" onClick={() => onFilterChange('failed')} />
        <FilterChip label={`Success (${successCount})`} active={filter === 'success'} color="grn" onClick={() => onFilterChange('success')} />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--mu)' }}>{filtered.length} run{filtered.length !== 1 ? 's' : ''} shown</span>
      </div>

      {!filtered.length ? (
        <EmptyState title="No runs match" subtitle={runs.length ? 'Try clearing the search filter' : 'Ingest your first run to see it here.'} />
      ) : (
        filtered.map((r) => (
          <div
            key={r.id}
            style={{ background: 'var(--bg2)', border: '1px solid var(--b0)', borderRadius: 'var(--rad-lg)', padding: 0, marginBottom: 8, cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
            onClick={() => onRunSelect(r.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onRunSelect(r.id)}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: r.status === 'failed' ? 'var(--re)' : 'var(--gr)' }} />
            <div style={{ padding: '12px 14px 12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, gap: 8, flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--mu)' }}>{r.id}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Badge variant={r.status === 'failed' ? 'red' : 'grn'}>{r.status === 'failed' ? 'Failed' : r.status === 'running' ? 'Running' : 'Success'}</Badge>
                  <Badge variant="mu">{r.complexity}</Badge>
                  <LayoutBadge layout={r.layout} />
                  <span className="bdg" style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--bg3)', padding: '2px 7px', borderRadius: 8, border: `1px solid ${r.accuracy >= 0.75 ? 'rgba(5,150,105,.3)' : r.accuracy >= 0.6 ? 'rgba(215,119,6,.3)' : 'rgba(220,38,38,.3)'}`, color: accCol(r.accuracy) }}>
                    acc: {Math.round(r.accuracy * 100)}%
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 5, color: 'var(--wh)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {r.title}
                <BlamrStatusBadge status={wfBlamrStatus.get(r.workflow_id) ?? computeBlamrStatus(r.started_at)} compact />
              </div>
              <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 5 }}>{r.workflow_id}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--mu)', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconClock />{formatRunTimestamp(r.started_at)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconUsers />{r.agents.length} agents</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconTok />{fT(r.total_tokens)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconDollar />{fC(r.total_cost_usd)}</span>
                <span>⏱ {formatDuration(r.total_ms)}</span>
              </div>
              {r.error && (
                <div style={{ marginTop: 7, fontSize: 11, color: 'var(--reL)', background: 'var(--reD)', borderRadius: 4, padding: '5px 9px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <IconWarn />{r.error}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
