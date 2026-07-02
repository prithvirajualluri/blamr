import {
  Controller,
  Post,
  Put,
  Body,
  Param,
  Headers,
  HttpCode,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';
import { KafkaService } from './services/kafka.service';
import { AuthService, ValkeyService } from './services/auth.service';
import { enrichEdge } from './utils/edge-hash';
import type { CausalEdge, ConfidenceGateResult } from '@blamr/types';
import { DEFAULT_WORKSPACE_SETTINGS } from '@blamr/types';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { ReasoningTraceEntity } from './entities/reasoning-trace.entity';

@Controller('v1')
export class IngestController {
  constructor(
    private readonly kafka: KafkaService,
    private readonly auth: AuthService,
    private readonly valkey: ValkeyService,
    @InjectRepository(WorkflowRunEntity)
    private readonly runRepo: Repository<WorkflowRunEntity>,
    @InjectRepository(ReasoningTraceEntity)
    private readonly reasoningTraceRepo: Repository<ReasoningTraceEntity>,
  ) {}

  private truncateSystemPrompt(prompt: string): string {
    if (process.env.BLAMR_STORE_SYSTEM_PROMPT_FULL === 'true' || process.env.BLAMR_STORE_SYSTEM_PROMPT_FULL === '1') {
      return prompt;
    }
    return prompt.length <= 2000 ? prompt : prompt.slice(0, 2000);
  }

  private async upsertRunMetadata(input: {
    runId: string;
    workspaceId: string;
    workflowId?: string;
    goalSnapshot?: string | null;
    systemPrompt?: string | null;
    systemPromptAgentId?: string | null;
  }): Promise<void> {
    const current = await this.runRepo.findOne({ where: { id: input.runId } });
    await this.runRepo.save({
      id: input.runId,
      workflow_id: current?.workflow_id ?? input.workflowId ?? 'unknown',
      workspace_id: current?.workspace_id ?? input.workspaceId,
      goal_snapshot: input.goalSnapshot ?? current?.goal_snapshot ?? null,
      system_prompt: input.systemPrompt ?? current?.system_prompt ?? null,
      system_prompt_hash:
        input.systemPrompt !== undefined && input.systemPrompt !== null
          ? createHash('sha256').update(input.systemPrompt).digest('hex')
          : (current?.system_prompt_hash ?? null),
      system_prompt_agent_id: input.systemPromptAgentId ?? current?.system_prompt_agent_id ?? null,
    });
  }

  @Post('edges')
  @HttpCode(202)
  async ingestEdges(
    @Headers('x-api-key') apiKey: string,
    @Body() body: CausalEdge | CausalEdge[],
  ) {
    const start = Date.now();
    const keyData = await this.auth.validateApiKey(apiKey);
    if (!keyData) throw new UnauthorizedException('Invalid API key');
    if (!keyData.scopes.includes('ingest:write')) {
      throw new UnauthorizedException('Missing ingest:write scope');
    }

    const allowed = await this.valkey.checkRateLimit(
      keyData.workspace_id,
      DEFAULT_WORKSPACE_SETTINGS.rate_limit_per_min,
    );
    if (!allowed) throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);

    const edges = Array.isArray(body) ? body : [body];
    if (edges.length === 0) throw new BadRequestException('No edges provided');

    const prepared: CausalEdge[] = [];
    const ensuredRunIds = new Set<string>();
    for (const edge of edges) {
      const workspaceId = edge.workspace_id || keyData.workspace_id;
      if (!ensuredRunIds.has(edge.run_id)) {
        await this.upsertRunMetadata({
          runId: edge.run_id,
          workspaceId,
          workflowId: edge.workflow_id,
        });
        ensuredRunIds.add(edge.run_id);
      }
      const edgeId = edge.id || uuidv4();
      let reasoning_trace_id = edge.reasoning_trace_id;
      if (edge.reasoning_trace?.content?.trim()) {
        reasoning_trace_id = reasoning_trace_id || `rt_${uuidv4()}`;
        await this.reasoningTraceRepo.save({
          id: reasoning_trace_id,
          edge_id: edgeId,
          run_id: edge.run_id,
          content: edge.reasoning_trace.content,
          model: edge.reasoning_trace.model,
          token_count: edge.reasoning_trace.token_count ?? null,
        });
      }
      prepared.push({
        ...edge,
        id: edgeId,
        reasoning_trace_id,
        reasoning_trace: undefined,
        workspace_id: workspaceId,
        timestamp_ms: edge.timestamp_ms || Date.now(),
      });
    }

    const enriched: CausalEdge[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const prevHash =
        i === 0 ? (prepared[0].run_id || uuidv4()) : enriched[i - 1].edge_hash;
      enriched.push(enrichEdge(prepared[i], prevHash));
    }

    const runId = enriched[0].run_id;

    await this.kafka.produce(
      'edges.raw',
      enriched.map((e) => ({
        key: e.workspace_id,
        value: JSON.stringify(e),
      })),
    );

    return {
      accepted: enriched.length,
      run_id: runId,
      latency_ms: Date.now() - start,
    };
  }

  @Put('runs/:run_id/metadata')
  @HttpCode(202)
  async putRunMetadata(
    @Headers('x-api-key') apiKey: string,
    @Param('run_id') runId: string,
    @Body()
    body: {
      workflow_id?: string;
      system_prompt?: string;
      goal_snapshot?: string;
      system_prompt_agent_id?: string;
    },
  ) {
    const keyData = await this.auth.validateApiKey(apiKey);
    if (!keyData) throw new UnauthorizedException('Invalid API key');

    const trimmedGoal = body.goal_snapshot?.trim();
    const trimmedPrompt = body.system_prompt?.trim();
    const storedPrompt = trimmedPrompt ? this.truncateSystemPrompt(trimmedPrompt) : undefined;

    await this.upsertRunMetadata({
      runId,
      workspaceId: keyData.workspace_id,
      workflowId: body.workflow_id,
      goalSnapshot: trimmedGoal ?? undefined,
      systemPrompt: storedPrompt ?? undefined,
      systemPromptAgentId: body.system_prompt_agent_id?.trim() || null,
    });

    if (trimmedGoal) await this.valkey.setRunGoalSnapshot(runId, trimmedGoal);
    if (storedPrompt) await this.valkey.setRunSystemPrompt(runId, storedPrompt);

    return { run_id: runId, status: 'accepted' };
  }

  @Put('runs/:run_id/goal-snapshot')
  @HttpCode(202)
  async putGoalSnapshot(
    @Headers('x-api-key') apiKey: string,
    @Param('run_id') runId: string,
    @Body() body: { goal_snapshot: string },
  ) {
    const keyData = await this.auth.validateApiKey(apiKey);
    if (!keyData) throw new UnauthorizedException('Invalid API key');
    const goalSnapshot = body.goal_snapshot?.trim();
    if (!goalSnapshot) throw new BadRequestException('goal_snapshot is required');

    await this.upsertRunMetadata({
      runId,
      workspaceId: keyData.workspace_id,
      goalSnapshot,
    });
    await this.valkey.setRunGoalSnapshot(runId, goalSnapshot);
    await this.kafka.produce('runs.goal_updated', [
      {
        key: runId,
        value: JSON.stringify({
          run_id: runId,
          workspace_id: keyData.workspace_id,
          goal_snapshot: goalSnapshot,
          updated_at: Date.now(),
        }),
      },
    ]);

    return { run_id: runId, status: 'accepted' };
  }

  @Post('runs/:run_id/complete')
  @HttpCode(202)
  async completeRun(
    @Headers('x-api-key') apiKey: string,
    @Param('run_id') runId: string,
    @Body()
    body: {
      status: 'success' | 'failed';
      error_summary?: string;
      confidence_accept_level?: number | null;
      confidence_gate_mode?: 'final' | 'min' | null;
      confidence_gate?: ConfidenceGateResult | null;
    },
  ) {
    const keyData = await this.auth.validateApiKey(apiKey);
    if (!keyData) throw new UnauthorizedException('Invalid API key');

    await this.kafka.produce('runs.completed', [
      {
        key: runId,
        value: JSON.stringify({
          run_id: runId,
          workspace_id: keyData.workspace_id,
          status: body.status,
          error_summary: body.error_summary || null,
          completed_at: Date.now(),
          confidence_accept_level: body.confidence_accept_level ?? null,
          confidence_gate_mode: body.confidence_gate_mode ?? null,
          confidence_gate: body.confidence_gate ?? null,
        }),
      },
    ]);

    return {
      run_id: runId,
      status: 'processing',
      poll_url: `/v1/runs/${runId}/blame`,
    };
  }
}
