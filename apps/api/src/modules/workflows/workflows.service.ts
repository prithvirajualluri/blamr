import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeBlamrStatus, type AgentConnectionSummary, type BlamrConnectionStatus } from '@blamr/types';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';

export type WorkflowHealth = 'all' | 'critical' | 'warning' | 'fair' | 'healthy';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
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
      };
    });

    return { workflows, total };
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
