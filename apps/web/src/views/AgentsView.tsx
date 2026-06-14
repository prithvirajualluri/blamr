import React from 'react';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { BlamrStatusBadge } from '../components/BlamrStatusBadge';
import { Pagination } from '../components/Pagination';
import { accCol } from '../utils/format';
import { formatLastSeen } from '../utils/blamr-status';
import { formatScaleCount, WORKFLOWS_PAGE_SIZE } from '../utils/registry';
import type { AgentApiRow } from '../api/runs';

interface AgentsViewProps {
  agents: AgentApiRow[];
  total: number;
  uniqueAgents: number;
  loading: boolean;
  error: string | null;
  search: string;
  page: number;
  onSearchChange: (q: string) => void;
  onPageChange: (p: number) => void;
  onAgentSelect: (agent: AgentApiRow) => void;
  onAgentViewAllRuns: (agent: AgentApiRow) => void;
  onWorkflowSelect: (workflowId: string) => void;
}

export function AgentsView({
  agents,
  total,
  uniqueAgents,
  loading,
  error,
  search,
  page,
  onSearchChange,
  onPageChange,
  onAgentSelect,
  onAgentViewAllRuns,
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
          <p className="view-subtitle">
            {formatScaleCount(total)} role{total === 1 ? '' : 's'} across workflows
            {uniqueAgents > 0 && uniqueAgents !== total ? ` · ${formatScaleCount(uniqueAgents)} unique agent IDs` : ''}
            {' · '}Click a row to open the latest execution trace
          </p>
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
                  <th>Role</th>
                  <th>Workflow</th>
                  <th>Connection</th>
                  <th>Executions</th>
                  <th>Hop confidence</th>
                  <th>Run accuracy</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr
                    key={`${a.workflow_id}:${a.id}`}
                    className="data-table-row-click"
                    onClick={() => onAgentSelect(a)}
                    title="Open latest execution trace for this agent"
                  >
                    <td><span className="mono table-primary">{a.id}</span></td>
                    <td>
                      <span className="agent-role-badge">{a.hop_role}</span>
                      <span className="table-muted mono" style={{ display: 'block', fontSize: 10, marginTop: 2 }}>
                        hop {a.hop_index + 1}/{a.hop_total}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="tag-chip"
                        onClick={(e) => { e.stopPropagation(); onWorkflowSelect(a.workflow_id); }}
                      >
                        {a.workflow_id}
                      </button>
                    </td>
                    <td><BlamrStatusBadge status={a.blamr_status} compact /></td>
                    <td className="mono">{formatScaleCount(a.run_count)}</td>
                    <td>
                      {a.avg_hop_confidence != null ? (
                        <span className="mono" style={{ color: accCol(a.avg_hop_confidence) }}>
                          {Math.round(a.avg_hop_confidence * 100)}%
                        </span>
                      ) : (
                        <span className="table-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className="mono" style={{ color: accCol(a.avg_run_accuracy) }}>
                        {Math.round(a.avg_run_accuracy * 100)}%
                      </span>
                    </td>
                    <td className="table-muted">{formatLastSeen(a.last_seen_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={(e) => { e.stopPropagation(); onAgentViewAllRuns(a); }}
                      >
                        All runs
                      </button>
                    </td>
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
