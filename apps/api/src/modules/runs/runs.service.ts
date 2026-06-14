import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';
import { BlameReportEntity } from '../../entities/blame-report.entity';
import { ClickHouseService } from '../../services/clickhouse.service';
import type { CausalEdge } from '@blamr/types';

@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
    @InjectRepository(BlameReportEntity)
    private readonly blameRepo: Repository<BlameReportEntity>,
    private readonly clickhouse: ClickHouseService,
  ) {}

  async list(params: {
    workspace_id: string;
    status?: string;
    workflow_id?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: FindOptionsWhere<WorkflowRunEntity> = {
      workspace_id: params.workspace_id,
    };
    if (params.status) where.status = params.status as WorkflowRunEntity['status'];
    if (params.workflow_id) where.workflow_id = params.workflow_id;

    const [runs, total] = await this.runRepo.findAndCount({
      where,
      order: { started_at: 'DESC' },
      take: params.limit || 50,
      skip: params.offset || 0,
    });

    return { runs, total };
  }

  private async requireRun(runId: string, workspaceId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId, workspace_id: workspaceId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return run;
  }

  async getById(id: string, workspaceId: string) {
    const run = await this.requireRun(id, workspaceId);
    const edges = await this.clickhouse.getEdgesByRunId(id);
    return { ...run, edges };
  }

  async getBlame(runId: string, workspaceId: string) {
    await this.requireRun(runId, workspaceId);
    const report = await this.blameRepo.findOne({ where: { run_id: runId } });
    if (!report) {
      throw new NotFoundException(`Blame report for ${runId} not found`);
    }
    return report;
  }

  async getConfidenceTrace(runId: string, workspaceId: string) {
    await this.requireRun(runId, workspaceId);
    const edges = await this.clickhouse.getEdgesByRunId(runId);
    return {
      hops: edges.map((e: CausalEdge) => ({
        agent: e.from_agent,
        ci: e.confidence_in,
        co: e.confidence_out,
        inflated: e.confidence_out - e.confidence_in > 0.15,
      })),
    };
  }

  async getIntentTrace(runId: string, workspaceId: string) {
    await this.requireRun(runId, workspaceId);
    const edges = await this.clickhouse.getEdgesByRunId(runId);
    return {
      hops: edges.map((e: CausalEdge) => ({
        agent: e.from_agent,
        pct: Math.round(Math.max(0, Math.min(100, (1 + e.intent_delta) * 100))),
      })),
    };
  }

  async exportRun(runId: string, workspaceId: string) {
    const run = await this.getById(runId, workspaceId);
    const blame = await this.getBlame(runId, workspaceId).catch(() => null);
    const lines = [
      JSON.stringify({ type: 'run', data: run }),
      ...run.edges.map((e) => JSON.stringify({ type: 'edge', data: e })),
    ];
    if (blame) lines.push(JSON.stringify({ type: 'blame', data: blame }));
    return lines.join('\n');
  }
}
