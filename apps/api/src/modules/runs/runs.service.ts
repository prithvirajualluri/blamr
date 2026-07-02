import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';
import { BlameReportEntity } from '../../entities/blame-report.entity';
import { HopReplayEntity } from '../../entities/hop-replay.entity';
import { ReasoningTraceEntity } from '../../entities/reasoning-trace.entity';
import { ClickHouseService } from '../../services/clickhouse.service';
import { computeFromEdges } from '@blamr/blame';
import { executeHopReplay, isReplayableHop } from '@blamr/replay';
import type {
  AgentBlame,
  BlameReport,
  CausalEdge,
  HopLlmReplayRequest,
  HopLlmReplaySummary,
} from '@blamr/types';

export interface ReplayBlameBody {
  hop_index: number;
  output_preview?: string;
  input_preview?: string;
  confidence_out?: number;
  intent_delta?: number;
}

export interface ReplayBlameDiff {
  agent: string;
  before_pct: number;
  after_pct: number;
  delta: number;
}

@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
    @InjectRepository(BlameReportEntity)
    private readonly blameRepo: Repository<BlameReportEntity>,
    @InjectRepository(HopReplayEntity)
    private readonly hopReplayRepo: Repository<HopReplayEntity>,
    @InjectRepository(ReasoningTraceEntity)
    private readonly reasoningTraceRepo: Repository<ReasoningTraceEntity>,
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
    const reasoningTraceIds = edges
      .map((edge) => edge.reasoning_trace_id)
      .filter((value): value is string => Boolean(value));
    const traces = reasoningTraceIds.length > 0
      ? await this.reasoningTraceRepo.findBy({ run_id: id })
      : [];
    const traceById = new Map(traces.map((trace) => [trace.id, trace]));
    return {
      ...run,
      edges: edges.map((edge) => {
        const trace = edge.reasoning_trace_id ? traceById.get(edge.reasoning_trace_id) : undefined;
        return trace
          ? {
              ...edge,
              reasoning_trace: {
                content: trace.content,
                model: trace.model,
                ...(trace.token_count != null ? { token_count: trace.token_count } : {}),
              },
            }
          : edge;
      }),
    };
  }

  /** Fast edge-only blame (no ML / Ollama). Used for on-demand recompute and counterfactual replay. */
  computeFastBlame(
    run: WorkflowRunEntity,
    edges: CausalEdge[],
  ): BlameReport & { fast_path: true } {
    const { report } = computeFromEdges(
      run.id,
      run.workflow_id,
      run.workspace_id,
      run.status as 'success' | 'failed',
      run.error_summary,
      edges,
    );
    return {
      run_id: run.id,
      ...report,
      method: `${report.method}_fast`,
      hop_analysis: [],
      ml_fusion: null,
      fast_path: true,
    };
  }

  async getBlame(runId: string, workspaceId: string, opts?: { recompute?: boolean }) {
    const run = await this.requireRun(runId, workspaceId);
    if (!opts?.recompute) {
      const stored = await this.blameRepo.findOne({ where: { run_id: runId } });
      if (stored) return stored;
    }

    const edges = await this.clickhouse.getEdgesByRunId(runId);
    if (edges.length === 0) {
      throw new NotFoundException(`Blame report for ${runId} not found (no edges)`);
    }
    return this.computeFastBlame(run, edges);
  }

  async replayBlame(runId: string, workspaceId: string, body: ReplayBlameBody) {
    const run = await this.requireRun(runId, workspaceId);
    const edges = await this.clickhouse.getEdgesByRunId(runId);
    if (edges.length === 0) {
      throw new NotFoundException(`No edges for run ${runId}`);
    }
    const hop = edges.find((e) => e.hop_index === body.hop_index);
    if (!hop) {
      throw new NotFoundException(`Hop ${body.hop_index} not found on run ${runId}`);
    }

    const original = await this.getBlame(runId, workspaceId).catch(() => this.computeFastBlame(run, edges));

    const patchedEdges = edges.map((e) =>
      e.hop_index === body.hop_index
        ? {
            ...e,
            ...(body.output_preview !== undefined ? { output_preview: body.output_preview } : {}),
            ...(body.input_preview !== undefined ? { input_preview: body.input_preview } : {}),
            ...(body.confidence_out !== undefined ? { confidence_out: body.confidence_out } : {}),
            ...(body.intent_delta !== undefined ? { intent_delta: body.intent_delta } : {}),
          }
        : e,
    );

    const counterfactual = this.computeFastBlame(run, patchedEdges);
    const diff = this.blameDiff(original.agents, counterfactual.agents);

    return {
      run_id: runId,
      hop_index: body.hop_index,
      patched_fields: {
        output_preview: body.output_preview ?? hop.output_preview,
        input_preview: body.input_preview ?? hop.input_preview,
        confidence_out: body.confidence_out ?? hop.confidence_out,
        intent_delta: body.intent_delta ?? hop.intent_delta,
      },
      original,
      counterfactual,
      diff,
    };
  }

  private blameDiff(before: AgentBlame[], after: AgentBlame[]): ReplayBlameDiff[] {
    const beforeMap = new Map(before.map((a) => [a.agent, a.blame_pct]));
    const agents = new Set([...before.map((a) => a.agent), ...after.map((a) => a.agent)]);
    const diff: ReplayBlameDiff[] = [];
    for (const agent of agents) {
      const b = beforeMap.get(agent) ?? 0;
      const a = after.find((x) => x.agent === agent)?.blame_pct ?? 0;
      if (Math.abs(a - b) >= 0.1) {
        diff.push({ agent, before_pct: b, after_pct: a, delta: Math.round((a - b) * 10) / 10 });
      }
    }
    return diff.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  }

  async replayHopLlm(
    runId: string,
    workspaceId: string,
    hopIndex: number,
    body: HopLlmReplayRequest,
  ) {
    const run = await this.requireRun(runId, workspaceId);
    const edges = await this.clickhouse.getEdgesByRunId(runId);
    if (edges.length === 0) {
      throw new NotFoundException(`No edges for run ${runId}`);
    }

    const hop = edges.find((e) => e.hop_index === hopIndex);
    if (!hop) {
      throw new NotFoundException(`Hop ${hopIndex} not found on run ${runId}`);
    }
    if (!isReplayableHop(hop)) {
      throw new BadRequestException(
        `Hop ${hopIndex} is not replayable (requires LLM/Vision call with a recorded model).`,
      );
    }

    const result = await executeHopReplay({
      runId,
      hopIndex,
      edges,
      request: body,
    });

    if (body.include_blame && result.new_output !== null && result.status !== 'error') {
      const original = await this.getBlame(runId, workspaceId).catch(() =>
        this.computeFastBlame(run, edges),
      );
      const patchedEdges = edges.map((e) =>
        e.hop_index === hopIndex ? { ...e, output_preview: result.new_output ?? e.output_preview } : e,
      );
      const counterfactual = this.computeFastBlame(run, patchedEdges);
      result.blame = {
        original: {
          root_cause_agent: original.root_cause_agent,
          root_cause_pct: original.root_cause_pct,
        },
        counterfactual: {
          root_cause_agent: counterfactual.root_cause_agent,
          root_cause_pct: counterfactual.root_cause_pct,
        },
        diff: this.blameDiff(original.agents, counterfactual.agents),
      };
    }

    await this.hopReplayRepo.save({
      id: result.replay_id,
      run_id: runId,
      workspace_id: workspaceId,
      hop_index: hopIndex,
      agent: hop.from_agent,
      model: result.model,
      status: result.status,
      note: body.note ?? null,
      result,
      created_at_ms: result.created_at_ms,
    });

    return result;
  }

  async listHopReplays(runId: string, workspaceId: string): Promise<{ replays: HopLlmReplaySummary[] }> {
    await this.requireRun(runId, workspaceId);
    const rows = await this.hopReplayRepo.find({
      where: { run_id: runId, workspace_id: workspaceId },
      order: { created_at_ms: 'DESC' },
      take: 100,
    });

    return {
      replays: rows.map((r) => ({
        replay_id: r.id,
        run_id: r.run_id,
        hop_index: r.hop_index,
        agent: r.agent,
        model: r.model ?? '',
        status: r.status as HopLlmReplaySummary['status'],
        note: r.note,
        created_at_ms: Number(r.created_at_ms),
      })),
    };
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
