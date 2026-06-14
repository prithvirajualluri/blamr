import React, { useMemo } from 'react';
import { FilterChip } from '../components/ui/FilterChip';
import { Badge } from '../components/ui/Badge';
import { BlamrStatusBadge } from '../components/BlamrStatusBadge';
import { LayoutBadge } from '../components/WorkflowTopology';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { VirtualList } from '../components/VirtualList';
import { Pagination } from '../components/Pagination';
import { accCol, fT } from '../utils/format';
import { formatDuration, formatRunTimestamp } from '../utils/runs';
import { computeBlamrStatus } from '../utils/blamr-status';
import { formatScaleCount, RUNS_PAGE_SIZE } from '../utils/registry';
import type { RunFilter, RunSummary } from '../types';
import type { RunStatusCounts } from '../api/runs';

const ROW_HEIGHT = 52;
const VIRTUAL_HEIGHT = 560;

interface RunsListViewProps {
  runs: RunSummary[];
  totalRuns: number;
  counts: RunStatusCounts;
  loading: boolean;
  error: string | null;
  filter: RunFilter;
  search: string;
  workflowFilter?: string;
  agentFilter?: string;
  page: number;
  onPageChange: (p: number) => void;
  onRunSelect: (id: string) => void;
  onFilterChange: (f: RunFilter) => void;
  onClearWorkflowFilter?: () => void;
  onViewAllAgents?: () => void;
}

export function RunsListView({
  runs,
  totalRuns,
  counts,
  loading,
  error,
  filter,
  search,
  workflowFilter,
  agentFilter,
  page,
  onPageChange,
  onRunSelect,
  onFilterChange,
  onClearWorkflowFilter,
  onViewAllAgents,
}: RunsListViewProps) {
  const useVirtual = totalRuns > RUNS_PAGE_SIZE;

  const wfBlamrStatus = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeBlamrStatus>>();
    for (const r of runs) m.set(r.workflow_id, computeBlamrStatus(r.started_at));
    return m;
  }, [runs]);

  if (loading && !runs.length) {
    return <div className="page-enter view-loading">Loading executions…</div>;
  }

  return (
    <div className="page-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">Executions</h1>
          <p className="view-subtitle">{formatScaleCount(totalRuns)} total runs in workspace</p>
        </div>
      </div>

      <ApiBanner error={error} />

      {(workflowFilter || agentFilter) && (
        <div className="filter-banner">
          {agentFilter && (
            <span>
              Agent: <strong className="mono">{agentFilter}</strong>
              {onViewAllAgents && (
                <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={onViewAllAgents}>← Agents</button>
              )}
            </span>
          )}
          {workflowFilter && (
            <span>
              Workflow: <strong className="mono">{workflowFilter}</strong>
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={onClearWorkflowFilter}>Clear</button>
        </div>
      )}

      <div className="toolbar">
        <div className="filter-row">
          <FilterChip label={`All (${formatScaleCount(totalRuns)})`} active={filter === 'all'} onClick={() => onFilterChange('all')} />
          <FilterChip label={`Failed (${formatScaleCount(counts.failed)})`} active={filter === 'failed'} color="red" onClick={() => onFilterChange('failed')} />
          <FilterChip label={`Success (${formatScaleCount(counts.success)})`} active={filter === 'success'} color="grn" onClick={() => onFilterChange('success')} />
        </div>
        <span className="toolbar-meta">Page {page} · {formatScaleCount(runs.length)} loaded</span>
      </div>

      {!runs.length ? (
        <EmptyState title="No executions match" subtitle={totalRuns ? 'Try clearing filters or search' : 'Ingest your first run to see it here.'} />
      ) : useVirtual ? (
        <div className="exec-table-wrap">
          <div className="exec-table-head">
            <span>Run</span><span>Workflow</span><span>Status</span><span>Accuracy</span><span>Agents</span><span>Tokens</span><span>Duration</span>
          </div>
          <VirtualList
            items={runs}
            rowHeight={ROW_HEIGHT}
            height={VIRTUAL_HEIGHT}
            rowKey={(r) => r.id}
            renderRow={(r) => (
              <ExecutionRow run={r} wfStatus={wfBlamrStatus.get(r.workflow_id) ?? computeBlamrStatus(r.started_at)} onSelect={() => onRunSelect(r.id)} />
            )}
          />
          <Pagination page={page} pageSize={RUNS_PAGE_SIZE} total={totalRuns} onPageChange={onPageChange} />
        </div>
      ) : (
        <>
          <div className="exec-table-wrap">
            <div className="exec-table-head">
              <span>Run</span><span>Workflow</span><span>Status</span><span>Accuracy</span><span>Agents</span><span>Tokens</span><span>Duration</span>
            </div>
            {runs.map((r) => (
              <ExecutionRow key={r.id} run={r} wfStatus={wfBlamrStatus.get(r.workflow_id) ?? computeBlamrStatus(r.started_at)} onSelect={() => onRunSelect(r.id)} />
            ))}
          </div>
          <Pagination page={page} pageSize={RUNS_PAGE_SIZE} total={totalRuns} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}

function ExecutionRow({ run: r, wfStatus, onSelect }: { run: RunSummary; wfStatus: ReturnType<typeof computeBlamrStatus>; onSelect: () => void }) {
  return (
    <div className={`exec-row exec-row-${r.status}`} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect()}>
      <div className="exec-cell exec-cell-run">
        <span className="exec-title">{r.title}</span>
        <span className="mono exec-id">{r.id}</span>
      </div>
      <div className="exec-cell mono exec-cell-wf">{r.workflow_id}<BlamrStatusBadge status={wfStatus} compact /></div>
      <div className="exec-cell"><Badge variant={r.status === 'failed' ? 'red' : 'grn'}>{r.status}</Badge><LayoutBadge layout={r.layout} /></div>
      <div className="exec-cell mono" style={{ color: accCol(r.accuracy) }}>{Math.round(r.accuracy * 100)}%</div>
      <div className="exec-cell mono">{r.agents.length}</div>
      <div className="exec-cell mono">{fT(r.total_tokens)}</div>
      <div className="exec-cell exec-cell-meta"><span>{formatDuration(r.total_ms)}</span><span className="table-muted">{formatRunTimestamp(r.started_at)}</span></div>
    </div>
  );
}
