import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka, Consumer, Producer } from 'kafkajs';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import Redis from 'ioredis';
import { Pool } from 'pg';
import type { CausalEdge, ReasoningTrace } from '@blamr/types';
import {
  enrichEdgesWithSemanticDrift,
  enrichEdgeWithReasoningTrace,
  isSemanticDriftEnabled,
  semanticSettleMs,
} from '@blamr/semantic';
import { RedisDriftCache } from './drift-cache';
import { sleep } from '@blamr/blame';
import { publishLiveEvent } from './live-publisher';

@Injectable()
export class ClickHouseWriterService implements OnModuleInit {
  private readonly logger = new Logger(ClickHouseWriterService.name);
  private consumer!: Consumer;
  private clickhouse!: ClickHouseClient;
  private pg!: Pool;
  private buffer: CausalEdge[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private driftCache!: RedisDriftCache;

  async onModuleInit() {
    this.clickhouse = createClient({
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      database: process.env.CLICKHOUSE_DATABASE || 'blamr',
    });
    this.pg = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://blamr:blamr_dev@localhost:5432/blamr',
    });
    this.driftCache = new RedisDriftCache(
      new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true }),
    );

    const kafka = new Kafka({
      clientId: 'blamr-ch-writer',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:19092').split(','),
    });

    this.consumer = kafka.consumer({ groupId: 'clickhouse-writer' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'edges.raw', fromBeginning: false });

    if (isSemanticDriftEnabled()) {
      this.logger.log('Async semantic drift enabled on edge flush');
    }

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const edge = JSON.parse(message.value.toString()) as CausalEdge;
        this.buffer.push(edge);
        if (this.buffer.length >= 1000) {
          await this.flush();
        } else if (!this.flushTimer) {
          this.flushTimer = setTimeout(() => this.flush(), 500);
        }
      },
    });

    this.logger.log('ClickHouse writer started');
  }

  private async hydrateReasoningTraces(edges: CausalEdge[]): Promise<void> {
    const traceIds = [...new Set(edges.map((edge) => edge.reasoning_trace_id).filter((id): id is string => Boolean(id)))];
    if (traceIds.length === 0) return;

    const result = await this.pg.query<{
      id: string;
      content: string;
      model: string;
      token_count: number | null;
    }>(
      'SELECT id, content, model, token_count FROM reasoning_traces WHERE id = ANY($1::text[])',
      [traceIds],
    );
    const tracesById = new Map<string, ReasoningTrace>(
      result.rows.map((row) => [
        row.id,
        {
          content: row.content,
          model: row.model,
          ...(row.token_count != null ? { token_count: row.token_count } : {}),
        },
      ]),
    );

    for (const edge of edges) {
      if (!edge.reasoning_trace_id || edge.reasoning_trace?.content) continue;
      const trace = tracesById.get(edge.reasoning_trace_id);
      if (trace) edge.reasoning_trace = trace;
    }
  }

  private async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    try {
      await enrichEdgesWithSemanticDrift(batch, this.driftCache, {
        debug: (m) => this.logger.debug(m),
        warn: (m) => this.logger.warn(m),
      });
      await this.hydrateReasoningTraces(batch);
      for (const edge of batch) {
        enrichEdgeWithReasoningTrace(edge);
      }

      await this.clickhouse.insert({
        table: 'causal_edges',
        values: batch,
        format: 'JSONEachRow',
      });
      this.logger.log(`Inserted ${batch.length} edges into ClickHouse`);

      for (const edge of batch) {
        void publishLiveEvent({
          type: 'edge.ingested',
          workspace_id: edge.workspace_id,
          run_id: edge.run_id,
          workflow_id: edge.workflow_id,
          timestamp_ms: edge.timestamp_ms || Date.now(),
          payload: {
            hop_index: edge.hop_index,
            from_agent: edge.from_agent,
            to_agent: edge.to_agent,
            model: edge.model,
          },
        });
      }
    } catch (err) {
      this.logger.error(`ClickHouse insert failed: ${err}`);
      this.buffer.unshift(...batch);
    }
  }
}

@Injectable()
export class RunAggregatorService implements OnModuleInit {
  private readonly logger = new Logger(RunAggregatorService.name);
  private consumer!: Consumer;
  private producer!: Producer;

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'blamr-run-aggregator',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:19092').split(','),
    });

    this.consumer = kafka.consumer({ groupId: 'run-aggregator' });
    this.producer = kafka.producer();
    await this.consumer.connect();
    await this.producer.connect();
    await this.consumer.subscribe({ topic: 'runs.completed', fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString());

        const settle = isSemanticDriftEnabled() ? semanticSettleMs() : 0;
        if (settle > 0) await sleep(settle);

        await this.producer.send({
          topic: 'blame.needed',
          messages: [{ key: event.run_id, value: JSON.stringify(event) }],
        });

        void publishLiveEvent({
          type: 'run.completed',
          workspace_id: event.workspace_id,
          run_id: event.run_id,
          timestamp_ms: event.completed_at ?? Date.now(),
          payload: { status: event.status, error_summary: event.error_summary ?? null },
        });

        this.logger.log(`Run ${event.run_id} queued for blame computation`);
      },
    });

    this.logger.log('Run aggregator started');
  }
}

@Injectable()
export class WebhookDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private consumer!: Consumer;

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'blamr-webhook-dispatcher',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:19092').split(','),
    });

    this.consumer = kafka.consumer({ groupId: 'webhook-dispatcher' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'blame.completed', fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString());
        this.logger.log(`Webhook event: blame.completed for run ${event.run_id}`);
        // Webhook delivery implemented via API webhook registry
      },
    });

    this.logger.log('Webhook dispatcher started');
  }
}
