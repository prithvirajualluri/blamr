import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeBlamrStatus } from '@blamr/types';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';
import { ClickHouseService } from '../../services/clickhouse.service';

export type AgentHealth = 'all' | 'online' | 'stale';

function hopRoleLabel(hopIndex: number, hopTotal: number): string {
  if (hopTotal <= 1) return 'Single hop';
  if (hopIndex <= 0) return 'Entry';
  if (hopIndex >= hopTotal - 1) return 'Final';
  return `Middle · ${hopIndex + 1}/${hopTotal}`;
}

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
    private readonly clickhouse: ClickHouseService,
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
        SELECT agent, r.workflow_id
        FROM workflow_runs r, jsonb_array_elements_text(r.agents) AS agent
        WHERE r.workspace_id = $1${whereExtra}
        GROUP BY agent, r.workflow_id
      ) sub`;
    const countRow = await this.runRepo.query<{ cnt: string }[]>(countSql, args);
    const total = Number(countRow[0]?.cnt ?? 0);

    args.push(limit, offset);
    const rows = await this.runRepo.query<
      Array<{
        agent_id: string;
        workflow_id: string;
        run_count: string;
        avg_run_accuracy: string;
        last_seen_at: string;
        hop_index_fallback: string | null;
        hop_total_fallback: string | null;
        latest_run_id: string | null;
      }>
    >(
      `WITH expanded AS (
         SELECT
           r.id,
           r.workflow_id,
           r.started_at,
           r.accuracy_score,
           agent,
           (ordinality - 1)::int AS ord_index
         FROM workflow_runs r,
         jsonb_array_elements_text(r.agents) WITH ORDINALITY AS t(agent, ordinality)
         WHERE r.workspace_id = $1${whereExtra}
       ),
       wf_hops AS (
         SELECT workflow_id, MAX(ord_index) + 1 AS hop_total
         FROM expanded
         GROUP BY workflow_id
       )
       SELECT
         e.agent AS agent_id,
         e.workflow_id,
         COUNT(DISTINCT e.id)::int AS run_count,
         AVG(e.accuracy_score)::float AS avg_run_accuracy,
         MAX(e.started_at)::bigint AS last_seen_at,
         MIN(e.ord_index)::int AS hop_index_fallback,
         w.hop_total::int AS hop_total_fallback,
         (
           SELECT r2.id
           FROM workflow_runs r2, jsonb_array_elements_text(r2.agents) AS a2(agent)
           WHERE r2.workspace_id = $1
             AND r2.workflow_id = e.workflow_id
             AND a2.agent = e.agent
           ORDER BY r2.started_at DESC
           LIMIT 1
         ) AS latest_run_id
       FROM expanded e
       JOIN wf_hops w ON w.workflow_id = e.workflow_id
       GROUP BY e.agent, e.workflow_id, w.hop_total
       ORDER BY run_count DESC, e.workflow_id ASC, e.agent ASC
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );

    const { agents: hopAgg, hopTotals } = await this.clickhouse.getAgentHopAggregates(workspaceId);

    const agents = rows.map((row) => {
      const lastSeenAt = Number(row.last_seen_at);
      const key = `${row.workflow_id}:${row.agent_id}`;
      const hop = hopAgg.get(key);
      const hopTotal =
        hopTotals.get(row.workflow_id) ?? Number(row.hop_total_fallback ?? 1);
      const hopIndex = hop?.hop_index ?? Number(row.hop_index_fallback ?? 0);
      const avgHopConfidence = hop?.avg_confidence_out ?? null;

      return {
        id: row.agent_id,
        workflow_id: row.workflow_id,
        run_count: Number(row.run_count),
        avg_run_accuracy: Number(row.avg_run_accuracy),
        avg_hop_confidence: avgHopConfidence,
        hop_index: hopIndex,
        hop_total: hopTotal,
        hop_role: hopRoleLabel(hopIndex, hopTotal),
        last_seen_at: lastSeenAt,
        latest_run_id: row.latest_run_id ?? null,
        blamr_status: computeBlamrStatus(lastSeenAt),
      };
    });

    const uniqueAgents = await this.runRepo.query<{ cnt: string }[]>(
      `SELECT COUNT(DISTINCT agent) AS cnt
       FROM workflow_runs r, jsonb_array_elements_text(r.agents) AS agent
       WHERE r.workspace_id = $1`,
      [workspaceId],
    );

    return {
      agents,
      total,
      unique_agents: Number(uniqueAgents[0]?.cnt ?? 0),
    };
  }
}
