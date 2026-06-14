import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeBlamrStatus } from '@blamr/types';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
  ) {}

  async overview(workspaceId: string) {
    const base = this.runRepo
      .createQueryBuilder('r')
      .where('r.workspace_id = :workspaceId', { workspaceId });

    const agg = await base
      .clone()
      .select('COUNT(*)', 'executions_total')
      .addSelect(`SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END)`, 'executions_success')
      .addSelect(`SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END)`, 'executions_failed')
      .addSelect(`SUM(CASE WHEN r.status = 'running' THEN 1 ELSE 0 END)`, 'executions_running')
      .addSelect('COUNT(DISTINCT r.workflow_id)', 'workflows_total')
      .addSelect('COALESCE(SUM(r.total_cost_usd), 0)', 'total_cost_usd')
      .addSelect('COALESCE(SUM(r.total_tokens), 0)', 'total_tokens')
      .addSelect('COALESCE(AVG(r.duration_ms), 0)', 'avg_duration_ms')
      .addSelect('COALESCE(AVG(r.accuracy_score), 0)', 'avg_accuracy')
      .getRawOne<Record<string, string>>();

    const wfHealth = await this.runRepo
      .createQueryBuilder('r')
      .select('r.workflow_id', 'workflow_id')
      .addSelect('AVG(r.accuracy_score)', 'avg_acc')
      .where('r.workspace_id = :workspaceId', { workspaceId })
      .groupBy('r.workflow_id')
      .getRawMany<{ workflow_id: string; avg_acc: string }>();

    let critical = 0;
    let warning = 0;
    let fair = 0;
    let healthy = 0;
    for (const row of wfHealth) {
      const acc = Number(row.avg_acc);
      if (acc < 0.6) critical += 1;
      else if (acc < 0.75) warning += 1;
      else if (acc < 0.9) fair += 1;
      else healthy += 1;
    }

    const agentRow = await this.runRepo.query<{ cnt: string }[]>(
      `SELECT COUNT(DISTINCT agent) AS cnt
       FROM workflow_runs r, jsonb_array_elements_text(r.agents) AS agent
       WHERE r.workspace_id = $1`,
      [workspaceId],
    );

    const total = Number(agg?.executions_total ?? 0);
    const success = Number(agg?.executions_success ?? 0);

    return {
      executions: {
        total,
        success,
        failed: Number(agg?.executions_failed ?? 0),
        running: Number(agg?.executions_running ?? 0),
        success_rate: total ? success / total : 0,
      },
      workflows: {
        total: Number(agg?.workflows_total ?? 0),
        critical,
        warning,
        fair,
        healthy,
      },
      agents: { total: Number(agentRow[0]?.cnt ?? 0) },
      cost: {
        total_usd: Number(agg?.total_cost_usd ?? 0),
        avg_per_run: total ? Number(agg?.total_cost_usd ?? 0) / total : 0,
      },
      tokens: {
        total: Number(agg?.total_tokens ?? 0),
        avg_per_run: total ? Number(agg?.total_tokens ?? 0) / total : 0,
      },
      latency: { avg_ms: Number(agg?.avg_duration_ms ?? 0) },
      accuracy: { avg: Number(agg?.avg_accuracy ?? 0) },
    };
  }
}
