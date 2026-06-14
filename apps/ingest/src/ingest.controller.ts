import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from './services/kafka.service';
import { AuthService, ValkeyService } from './services/auth.service';
import { enrichEdge } from './utils/edge-hash';
import type { CausalEdge, ConfidenceGateResult } from '@blamr/types';
import { DEFAULT_WORKSPACE_SETTINGS } from '@blamr/types';

@Controller('v1')
export class IngestController {
  constructor(
    private readonly kafka: KafkaService,
    private readonly auth: AuthService,
    private readonly valkey: ValkeyService,
  ) {}

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

    const prepared: CausalEdge[] = edges.map((edge) => ({
      ...edge,
      id: edge.id || uuidv4(),
      workspace_id: edge.workspace_id || keyData.workspace_id,
      timestamp_ms: edge.timestamp_ms || Date.now(),
    }));

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
