import React from 'react';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { BlamrStatusBadge } from '../components/BlamrStatusBadge';
import { Pagination } from '../components/Pagination';
import { accCol, fT } from '../utils/format';
import { formatLastSeen } from '../utils/blamr-status';
import { formatScaleCount, WORKFLOWS_PAGE_SIZE } from '../utils/registry';
import type { AgentApiRow } from '../api/runs';

interface AgentsViewProps {
  agents: AgentApiRow[];
  total: number;
  loading: boolean;
  error: string | null;
  search: string;
  page: number;
  onSearchChange: (q: string) => void;
  onPageChange: (p: number) => void;
  onWorkflowSelect: (workflowId: string) => void;
}

export function AgentsView({
  agents,
  total,
  loading,
  error,
  search,
  page,
  onSearchChange,
  onPageChange,
  onWorkflowSelect,
}: AgentsViewProps) {
  if (loading && !agents.length) {
    return <div className="page-enter view-loading">Loading agents…</div>;
  }

  return (
    <div className="page-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">Agents</h1>
          <p className="view-subtitle">{formatScaleCount(total)} unique agents across all workflows</p>
        </div>
      </div>

      <ApiBanner error={error} />

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search agent or workflow…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {!agents.length ? (
        <EmptyState title="No agents found" subtitle="Agents appear when runs include agent IDs in causal edges." />
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Connection</th>
                  <th>Executions</th>
                  <th>Avg accuracy</th>
                  <th>Workflows</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td><span className="mono table-primary">{a.id}</span></td>
                    <td><BlamrStatusBadge status={a.blamr_status} compact /></td>
                    <td className="mono">{formatScaleCount(a.run_count)}</td>
                    <td><span className="mono" style={{ color: accCol(a.avg_accuracy) }}>{Math.round(a.avg_accuracy * 100)}%</span></td>
                    <td>
                      <div className="tag-row">
                        {a.workflow_ids.slice(0, 2).map((w) => (
                          <button key={w} type="button" className="tag-chip" onClick={() => onWorkflowSelect(w)}>{w}</button>
                        ))}
                        {a.workflow_ids.length > 2 && <span className="table-muted">+{a.workflow_ids.length - 2}</span>}
                      </div>
                    </td>
                    <td className="table-muted">{formatLastSeen(a.last_seen_at)}</td>
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
