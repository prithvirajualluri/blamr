import React from 'react';
import { FilterChip } from '../components/ui/FilterChip';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { BlamrStatusDot } from '../components/BlamrStatusBadge';
import { Pagination } from '../components/Pagination';
import { accCol, fC, fT } from '../utils/format';
import { formatDuration } from '../utils/runs';
import { formatLastSeen } from '../utils/blamr-status';
import { formatScaleCount, WORKFLOWS_PAGE_SIZE } from '../utils/registry';
import type { WorkflowApiRow } from '../api/runs';

interface WorkflowsViewProps {
  workflows: WorkflowApiRow[];
  total: number;
  loading: boolean;
  error: string | null;
  search: string;
  health: string;
  sort: string;
  page: number;
  onSearchChange: (q: string) => void;
  onHealthChange: (h: string) => void;
  onSortChange: (s: string) => void;
  onPageChange: (p: number) => void;
  onWorkflowSelect: (workflowId: string) => void;
  onRunSelect: (id: string) => void;
}

export function WorkflowsView({
  workflows,
  total,
  loading,
  error,
  search,
  health,
  sort,
  page,
  onSearchChange,
  onHealthChange,
  onSortChange,
  onPageChange,
  onWorkflowSelect,
}: WorkflowsViewProps) {
  if (loading && !workflows.length) {
    return <div className="page-enter view-loading">Loading workflows…</div>;
  }

  return (
    <div className="page-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">Workflows</h1>
          <p className="view-subtitle">{formatScaleCount(total)} workflows registered in this workspace</p>
        </div>
        <div className="view-header-actions">
          <select value={sort} onChange={(e) => onSortChange(e.target.value)} className="select-sm" aria-label="Sort workflows">
            <option value="runs">Most executions</option>
            <option value="acc">Lowest accuracy</option>
            <option value="acc-d">Highest accuracy</option>
            <option value="recent">Recently active</option>
          </select>
        </div>
      </div>

      <ApiBanner error={error} />

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search workflow ID…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <div className="filter-row">
          <FilterChip label="All" active={health === 'all'} onClick={() => onHealthChange('all')} />
          <FilterChip label="Critical" active={health === 'critical'} color="red" onClick={() => onHealthChange('critical')} />
          <FilterChip label="Warning" active={health === 'warning'} color="amb" onClick={() => onHealthChange('warning')} />
          <FilterChip label="Fair" active={health === 'fair'} color="cyn" onClick={() => onHealthChange('fair')} />
          <FilterChip label="Healthy" active={health === 'healthy'} color="grn" onClick={() => onHealthChange('healthy')} />
        </div>
      </div>

      {!workflows.length ? (
        <EmptyState title="No workflows match" subtitle={total ? 'Try a different search or filter' : 'Ingest your first run to register workflows.'} />
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Executions</th>
                  <th>Avg accuracy</th>
                  <th>Total cost</th>
                  <th>Tokens</th>
                  <th>Avg latency</th>
                  <th>Agents</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => (
                  <tr key={wf.id} className="data-table-row-click" onClick={() => onWorkflowSelect(wf.id)}>
                    <td><span className="mono table-primary">{wf.name}</span></td>
                    <td><BlamrStatusDot status={wf.blamr_status} /></td>
                    <td className="mono">{formatScaleCount(wf.run_count)}</td>
                    <td><span className="mono" style={{ color: accCol(wf.avg_accuracy) }}>{Math.round(wf.avg_accuracy * 100)}%</span></td>
                    <td className="mono">{fC(wf.total_cost_usd)}</td>
                    <td className="mono">{fT(wf.total_tokens)}</td>
                    <td className="mono table-muted">{formatDuration(Math.round(wf.avg_duration_ms))}</td>
                    <td className="mono">{wf.agents.length}</td>
                    <td className="table-muted">{formatLastSeen(wf.last_run_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={WORKFLOWS_PAGE_SIZE} total={total} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}
