import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeBlamrStatus, type AgentConnectionSummary, type BlamrConnectionStatus } from '@blamr/types';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
  ) {}

  async list(workspaceId?: string) {
    const qb = this.runRepo.createQueryBuilder('r');
    if (workspaceId) {
      qb.where('r.workspace_id = :workspaceId', { workspaceId });
    }
    const runs = await qb.getMany();

    const byWorkflow = new Map<
      string,
      {
        run_count: number;
        accuracy_sum: number;
        last_run_at: number;
        agents: Map<string, number>;
      }
    >();

    for (const run of runs) {
      const wf = byWorkflow.get(run.workflow_id) ?? {
        run_count: 0,
        accuracy_sum: 0,
        last_run_at: 0,
        agents: new Map<string, number>(),
      };
      wf.run_count += 1;
      wf.accuracy_sum += Number(run.accuracy_score ?? 0);
      const started = Number(run.started_at ?? 0);
      wf.last_run_at = Math.max(wf.last_run_at, started);
      for (const agent of run.agents ?? []) {
        wf.agents.set(agent, Math.max(wf.agents.get(agent) ?? 0, started));
      }
      byWorkflow.set(run.workflow_id, wf);
    }

    const workflows = Array.from(byWorkflow.entries())
      .map(([id, wf]) => {
        const blamr_status: BlamrConnectionStatus = computeBlamrStatus(wf.last_run_at);
        const agents: AgentConnectionSummary[] = Array.from(wf.agents.entries())
          .map(([agent_id, last_seen_at]) => ({
            agent_id,
            workflow_id: id,
            last_seen_at,
            blamr_status: computeBlamrStatus(last_seen_at),
          }))
          .sort((a, b) => a.agent_id.localeCompare(b.agent_id));

        return {
          id,
          name: id,
          run_count: wf.run_count,
          avg_accuracy: wf.run_count ? wf.accuracy_sum / wf.run_count : 0,
          last_run_at: wf.last_run_at,
          blamr_status,
          agents,
        };
      })
      .sort((a, b) => b.run_count - a.run_count);

    return { workflows, total: workflows.length };
  }

  async accuracyHistory(workflowId: string) {
    const runs = await this.runRepo.find({
      where: { workflow_id: workflowId },
      select: ['id', 'accuracy_score', 'started_at'],
      order: { started_at: 'ASC' },
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
