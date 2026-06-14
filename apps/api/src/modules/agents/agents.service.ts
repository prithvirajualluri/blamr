import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeBlamrStatus } from '@blamr/types';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';

export type AgentHealth = 'all' | 'online' | 'stale';

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
  ) {}

  async list(
    workspaceId: string,
    params: { limit?: number; offset?: number; q?: string },
  ) {
    const limit = Math.min(params.limit ?? 40, 200);
    const offset = params.offset ?? 0;
    const q = params.q?.trim();

    let whereExtra = '';
    const args: unknown[] = [workspaceId];
    if (q) {
      args.push(`%${q}%`);
      whereExtra = ` AND (agent ILIKE $${args.length} OR r.workflow_id ILIKE $${args.length})`;
    }

    const countSql = `
      SELECT COUNT(*) AS cnt FROM (
        SELECT agent
        FROM workflow_runs r, jsonb_array_elements_text(r.agents) AS agent
        WHERE r.workspace_id = $1${whereExtra}
        GROUP BY agent
      ) sub`;
    const countRow = await this.runRepo.query<{ cnt: string }[]>(countSql, args);
    const total = Number(countRow[0]?.cnt ?? 0);

    args.push(limit, offset);
    const rows = await this.runRepo.query<
      Array<{
        agent_id: string;
        run_count: string;
        avg_accuracy: string;
        last_seen_at: string;
        workflow_ids: string[];
      }>
    >(
      `SELECT
         agent AS agent_id,
         COUNT(DISTINCT r.id)::int AS run_count,
         AVG(r.accuracy_score)::float AS avg_accuracy,
         MAX(r.started_at)::bigint AS last_seen_at,
         array_agg(DISTINCT r.workflow_id) AS workflow_ids
       FROM workflow_runs r, jsonb_array_elements_text(r.agents) AS agent
       WHERE r.workspace_id = $1${whereExtra}
       GROUP BY agent
       ORDER BY run_count DESC, agent ASC
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );

    const agents = rows.map((row) => {
      const lastSeenAt = Number(row.last_seen_at);
      return {
        id: row.agent_id,
        run_count: Number(row.run_count),
        avg_accuracy: Number(row.avg_accuracy),
        last_seen_at: lastSeenAt,
        workflow_ids: (row.workflow_ids ?? []).slice(0, 20),
        blamr_status: computeBlamrStatus(lastSeenAt),
      };
    });

    return { agents, total };
  }
}
