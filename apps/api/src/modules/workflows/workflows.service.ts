import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  computeBlamrStatus,
  type AgentConnectionSummary,
  type BlamrConnectionStatus,
  type WorkspaceSettings,
} from '@blamr/types';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';
import { WorkspaceEntity } from '../../entities/workspace.entity';
import { BlameReportEntity } from '../../entities/blame-report.entity';
import { ClickHouseService } from '../../services/clickhouse.service';
import {
  analyzeIntegrationHealth,
  type EdgeSample,
  type DriftHopSample,
  type WorkflowIntegrationHealth,
} from './integration-health';

export type WorkflowHealth = 'all' | 'critical' | 'warning' | 'fair' | 'healthy';

const INTEGRATION_HEALTH_RUNS = 15;

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepo: Repository<WorkspaceEntity>,
    @InjectRepository(BlameReportEntity)
    private readonly blameRepo: Repository<BlameReportEntity>,
    private readonly clickhouse: ClickHouseService,
  ) {}

  private healthHaving(health: WorkflowHealth): string | null {
    switch (health) {
      case 'critical':
        return 'AVG(r.accuracy_score) < 0.6';
      case 'warning':
        return 'AVG(r.accuracy_score) >= 0.6 AND AVG(r.accuracy_score) < 0.75';
      case 'fair':
        return 'AVG(r.accuracy_score) >= 0.75 AND AVG(r.accuracy_score) < 0.9';
      case 'healthy':
        return 'AVG(r.accuracy_score) >= 0.9';
      default:
        return null;
    }
  }

  async list(
    workspaceId: string,
    params: { limit?: number; offset?: number; q?: string; health?: WorkflowHealth; sort?: string },
  ) {
    const limit = Math.min(params.limit ?? 40, 200);
    const offset = params.offset ?? 0;
    const q = params.q?.trim();
    const health = params.health ?? 'all';

    const args: unknown[] = [workspaceId];
    let whereExtra = '';
    if (q) {
      args.push(`%${q}%`);
      whereExtra = ` AND r.workflow_id ILIKE $${args.length}`;
    }

    const having = this.healthHaving(health);
    const havingClause = having ? ` HAVING ${having}` : '';

    const countSql = `
      SELECT COUNT(*) AS cnt FROM (
        SELECT r.workflow_id
        FROM workflow_runs r
        WHERE r.workspace_id = $1${whereExtra}
        GROUP BY r.workflow_id${havingClause}
      ) sub`;
    const countRow = await this.runRepo.query<{ cnt: string }[]>(countSql, args);
    const total = Number(countRow[0]?.cnt ?? 0);

    let orderBy = 'run_count DESC, id ASC';
    if (params.sort === 'acc') orderBy = 'avg_accuracy ASC, id ASC';
    if (params.sort === 'acc-d') orderBy = 'avg_accuracy DESC, id ASC';
    if (params.sort === 'recent') orderBy = 'last_run_at DESC, id ASC';

    args.push(limit, offset);
    const rows = await this.runRepo.query<
      Array<{
        id: string;
        run_count: string;
        failed_runs: string;
        success_runs: string;
        avg_accuracy: string;
        total_cost_usd: string;
        total_tokens: string;
        avg_duration_ms: string;
        last_run_at: string;
      }>
    >(
      `SELECT
         r.workflow_id AS id,
         COUNT(*)::int AS run_count,
         SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END)::int AS failed_runs,
         SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END)::int AS success_runs,
         AVG(r.accuracy_score)::float AS avg_accuracy,
         COALESCE(SUM(r.total_cost_usd), 0)::float AS total_cost_usd,
         COALESCE(SUM(r.total_tokens), 0)::bigint AS total_tokens,
         COALESCE(AVG(r.duration_ms), 0)::float AS avg_duration_ms,
         MAX(r.started_at)::bigint AS last_run_at
       FROM workflow_runs r
       WHERE r.workspace_id = $1${whereExtra}
       GROUP BY r.workflow_id${havingClause}
       ORDER BY ${orderBy}
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );

    const ids = rows.map((r) => r.id);
    const agentsByWf = new Map<string, AgentConnectionSummary[]>();
    if (ids.length) {
      const agentRows = await this.runRepo.query<
        Array<{ workflow_id: string; agent_id: string; last_seen_at: string }>
      >(
        `SELECT r.workflow_id, agent AS agent_id, MAX(r.started_at)::bigint AS last_seen_at
         FROM workflow_runs r, jsonb_array_elements_text(r.agents) AS agent
         WHERE r.workspace_id = $1 AND r.workflow_id = ANY($2)
         GROUP BY r.workflow_id, agent`,
        [workspaceId, ids],
      );
      for (const ar of agentRows) {
        const list = agentsByWf.get(ar.workflow_id) ?? [];
        const lastSeen = Number(ar.last_seen_at);
        list.push({
          agent_id: ar.agent_id,
          workflow_id: ar.workflow_id,
          last_seen_at: lastSeen,
          blamr_status: computeBlamrStatus(lastSeen),
        });
        agentsByWf.set(ar.workflow_id, list);
      }
    }

    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    const settings = (workspace?.settings ?? {}) as WorkspaceSettings;
    const healthByWf = await this.buildIntegrationHealth(workspaceId, ids, settings);

    const workflows = rows.map((row) => {
      const lastRunAt = Number(row.last_run_at);
      const blamr_status: BlamrConnectionStatus = computeBlamrStatus(lastRunAt);
      const agents = (agentsByWf.get(row.id) ?? []).sort((a, b) =>
        a.agent_id.localeCompare(b.agent_id),
      );
      return {
        id: row.id,
        name: row.id,
        run_count: Number(row.run_count),
        failed_runs: Number(row.failed_runs),
        success_runs: Number(row.success_runs),
        avg_accuracy: Number(row.avg_accuracy),
        total_cost_usd: Number(row.total_cost_usd),
        total_tokens: Number(row.total_tokens),
        avg_duration_ms: Number(row.avg_duration_ms),
        last_run_at: lastRunAt,
        blamr_status,
        agents,
        integration_health: healthByWf.get(row.id) ?? {
          level: 'healthy' as const,
          recommendations: [],
          runs_analyzed: 0,
          edges_analyzed: 0,
        },
      };
    });

    return { workflows, total };
  }

  private async buildIntegrationHealth(
    workspaceId: string,
    workflowIds: string[],
    settings: WorkspaceSettings,
  ): Promise<Map<string, WorkflowIntegrationHealth>> {
    const result = new Map<string, WorkflowIntegrationHealth>();
    if (!workflowIds.length) return result;

    const recentRuns = await this.runRepo.query<
      Array<{ workflow_id: string; id: string; status: string }>
    >(
      `SELECT workflow_id, id, status
       FROM (
         SELECT workflow_id, id, status,
           ROW_NUMBER() OVER (PARTITION BY workflow_id ORDER BY started_at DESC) AS rn
         FROM workflow_runs
         WHERE workspace_id = $1 AND workflow_id = ANY($2)
       ) sub
       WHERE rn <= $3`,
      [workspaceId, workflowIds, INTEGRATION_HEALTH_RUNS],
    );

    const runIds = recentRuns.map((r) => r.id);
    let edgesByRun = new Map<string, import('@blamr/types').CausalEdge[]>();
    if (runIds.length) {
      try {
        edgesByRun = await this.clickhouse.getEdgesByRunIds(runIds);
      } catch {
        /* ClickHouse unavailable */
      }
    }

    const blameReports = runIds.length
      ? await this.blameRepo.find({
          where: { run_id: In(runIds) },
          select: ['run_id', 'hop_analysis'],
        })
      : [];

    const runWorkflow = new Map(recentRuns.map((r) => [r.id, r.workflow_id]));
    const successRunIds = new Set(
      recentRuns.filter((r) => r.status === 'success').map((r) => r.id),
    );

    for (const wfId of workflowIds) {
      const runs = recentRuns
        .filter((r) => r.workflow_id === wfId)
        .map((r) => ({ id: r.id, status: r.status }));

      const edges: EdgeSample[] = [];
      for (const run of runs) {
        for (const e of edgesByRun.get(run.id) ?? []) {
          edges.push({
            run_id: e.run_id,
            from_agent: e.from_agent,
            to_agent: e.to_agent,
            confidence_in: e.confidence_in,
            confidence_out: e.confidence_out,
            intent_delta: e.intent_delta,
            input_preview: e.input_preview ?? '',
            output_preview: e.output_preview ?? '',
            call_type: e.call_type,
            model: e.model ?? '',
            tokens_in: e.tokens_in,
            tokens_out: e.tokens_out,
            cost_usd: e.cost_usd,
            latency_ms: e.latency_ms,
          });
        }
      }

      const driftHops: DriftHopSample[] = [];
      for (const br of blameReports) {
        if (!successRunIds.has(br.run_id)) continue;
        if (runWorkflow.get(br.run_id) !== wfId) continue;
        for (const h of br.hop_analysis ?? []) {
          driftHops.push({
            run_id: br.run_id,
            hop_index: h.hop_index,
            drift_type: h.drift_type,
            drift_score: h.drift_score,
          });
        }
      }

      const profile = settings.workflow_configs?.[wfId];
      const hasWorkflowGate =
        profile?.confidence_accept_level != null
        || settings.default_confidence_accept_level != null;

      result.set(wfId, analyzeIntegrationHealth(edges, runs, driftHops, hasWorkflowGate));
    }

    return result;
  }

  async accuracyHistory(workflowId: string, workspaceId?: string) {
    const where: { workflow_id: string; workspace_id?: string } = { workflow_id: workflowId };
    if (workspaceId) where.workspace_id = workspaceId;

    const runs = await this.runRepo.find({
      where,
      select: ['id', 'accuracy_score', 'started_at'],
      order: { started_at: 'ASC' },
      take: 500,
    });

    return {
      runs: runs.map((r) => ({
        run_id: r.id,
        accuracy: r.accuracy_score,
        timestamp: r.started_at,
      })),
    };
  }
}
