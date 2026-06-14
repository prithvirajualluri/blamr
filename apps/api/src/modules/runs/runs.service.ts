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

  private async statusCounts(workspaceId: string, workflowId?: string, agentId?: string) {
    const qb = this.runRepo
      .createQueryBuilder('r')
      .select(`SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END)`, 'success')
      .addSelect(`SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END)`, 'failed')
      .addSelect(`SUM(CASE WHEN r.status = 'running' THEN 1 ELSE 0 END)`, 'running')
      .where('r.workspace_id = :workspaceId', { workspaceId });
    if (workflowId) qb.andWhere('r.workflow_id = :workflowId', { workflowId });
    if (agentId) qb.andWhere(`r.agents @> :agentArr::jsonb`, { agentArr: JSON.stringify([agentId]) });
    const row = await qb.getRawOne<Record<string, string>>();
    return {
      success: Number(row?.success ?? 0),
      failed: Number(row?.failed ?? 0),
      running: Number(row?.running ?? 0),
    };
  }

  async list(params: {
    workspace_id: string;
    status?: string;
    workflow_id?: string;
    agent_id?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit || 50, 200);
    const offset = params.offset || 0;
    const useQueryBuilder = Boolean(params.q?.trim() || params.agent_id);

    if (useQueryBuilder) {
      const qb = this.runRepo
        .createQueryBuilder('r')
        .where('r.workspace_id = :workspaceId', { workspaceId: params.workspace_id });
      if (params.q?.trim()) {
        const q = `%${params.q.trim()}%`;
        qb.andWhere(
          '(r.id ILIKE :q OR r.workflow_id ILIKE :q OR r.title ILIKE :q OR r.error_summary ILIKE :q)',
          { q },
        );
      }
      if (params.status) qb.andWhere('r.status = :status', { status: params.status });
      if (params.workflow_id) qb.andWhere('r.workflow_id = :workflowId', { workflowId: params.workflow_id });
      if (params.agent_id) {
        qb.andWhere(`r.agents @> :agentArr::jsonb`, { agentArr: JSON.stringify([params.agent_id]) });
      }

      const [runs, total] = await qb
        .orderBy('r.started_at', 'DESC')
        .take(limit)
        .skip(offset)
        .getManyAndCount();

      const counts = await this.statusCounts(params.workspace_id, params.workflow_id, params.agent_id);
      return { runs, total, counts };
    }

    const where: FindOptionsWhere<WorkflowRunEntity> = {
      workspace_id: params.workspace_id,
    };
    if (params.status) where.status = params.status as WorkflowRunEntity['status'];
    if (params.workflow_id) where.workflow_id = params.workflow_id;

    const [runs, total] = await this.runRepo.findAndCount({
      where,
      order: { started_at: 'DESC' },
      take: limit,
      skip: offset,
    });

    const counts = await this.statusCounts(params.workspace_id, params.workflow_id, params.agent_id);
    return { runs, total, counts };
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

  async getConfidenceTrace(runId: string, workspaceId: string, inflationThreshold = 0.15) {
    await this.requireRun(runId, workspaceId);
    const edges = await this.clickhouse.getEdgesByRunId(runId);
    return {
      hops: edges.map((e: CausalEdge) => ({
        agent: e.from_agent,
        ci: e.confidence_in,
        co: e.confidence_out,
        inflated: e.confidence_out - e.confidence_in > inflationThreshold,
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
