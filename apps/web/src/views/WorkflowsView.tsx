import React, { useState } from 'react';
import { FilterChip } from '../components/ui/FilterChip';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { BlamrStatusDot } from '../components/BlamrStatusBadge';
import { Pagination } from '../components/Pagination';
import { accCol, fC, fT } from '../utils/format';
import { formatDuration } from '../utils/runs';
import { formatLastSeen } from '../utils/blamr-status';
import { formatScaleCount, WORKFLOWS_PAGE_SIZE } from '../utils/registry';
import type { IntegrationRecommendation, WorkflowApiRow, WorkflowIntegrationHealth } from '../api/runs';

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

function IntegrationHealthBadge({ level }: { level: WorkflowIntegrationHealth['level'] }) {
  const label = level === 'healthy' ? 'OK' : level === 'attention' ? 'Review' : 'Fix';
  return <span className={`ih-badge ih-${level}`}>{label}</span>;
}

function RecommendationItem({ rec }: { rec: IntegrationRecommendation }) {
  return (
    <li className={`ih-rec ih-rec-${rec.severity}`}>
      <span className="ih-rec-title">{rec.title}</span>
      <span className="ih-rec-detail">{rec.detail}</span>
    </li>
  );
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && !workflows.length) {
    return <div className="page-enter view-loading">Loading workflows…</div>;
  }

  return (
    <div className="page-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">Workflows</h1>
          <p className="view-subtitle">
            {formatScaleCount(total)} workflows registered in this workspace
            {' · '}Instrumentation column flags SDK integration issues from recent runs
          </p>
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
                  <th>Instrumentation</th>
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
                {workflows.map((wf) => {
                  const ih = wf.integration_health;
                  const hasRecs = ih.recommendations.length > 0;
                  const isOpen = expanded.has(wf.id);
                  return (
                    <React.Fragment key={wf.id}>
                      <tr className="data-table-row-click" onClick={() => onWorkflowSelect(wf.id)}>
                        <td><span className="mono table-primary">{wf.name}</span></td>
                        <td><BlamrStatusDot status={wf.blamr_status} /></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="ih-toggle"
                            onClick={() => hasRecs && toggleExpanded(wf.id)}
                            disabled={!hasRecs}
                            title={
                              hasRecs
                                ? `${ih.recommendations.length} recommendation(s) — click to ${isOpen ? 'hide' : 'show'}`
                                : `Analyzed ${ih.runs_analyzed} run(s), ${ih.edges_analyzed} hop(s) — no issues`
                            }
                          >
                            <IntegrationHealthBadge level={ih.level} />
                            {hasRecs && <span className="ih-chevron">{isOpen ? '▴' : '▾'}</span>}
                          </button>
                        </td>
                        <td className="mono">{formatScaleCount(wf.run_count)}</td>
                        <td><span className="mono" style={{ color: accCol(wf.avg_accuracy) }}>{Math.round(wf.avg_accuracy * 100)}%</span></td>
                        <td className="mono">{fC(wf.total_cost_usd)}</td>
                        <td className="mono">{fT(wf.total_tokens)}</td>
                        <td className="mono table-muted">{formatDuration(Math.round(wf.avg_duration_ms))}</td>
                        <td className="mono">{wf.agents.length}</td>
                        <td className="table-muted">{formatLastSeen(wf.last_run_at)}</td>
                      </tr>
                      {isOpen && hasRecs && (
                        <tr className="ih-detail-row">
                          <td colSpan={10}>
                            <div className="ih-panel">
                              <div className="ih-panel-meta">
                                Based on last {ih.runs_analyzed} run(s), {ih.edges_analyzed} causal hop(s).
                                {' '}
                                <a href="/docs.html#connect-typescript" target="_blank" rel="noreferrer">SDK integration guide</a>
                              </div>
                              <ul className="ih-rec-list">
                                {ih.recommendations.map((rec) => (
                                  <RecommendationItem key={rec.id} rec={rec} />
                                ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={WORKFLOWS_PAGE_SIZE} total={total} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}
