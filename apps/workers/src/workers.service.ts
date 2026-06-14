import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka, Consumer, Producer } from 'kafkajs';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import Redis from 'ioredis';
import type { CausalEdge } from '@blamr/types';
import {
  enrichEdgesWithSemanticDrift,
  isSemanticDriftEnabled,
  semanticSettleMs,
} from '@blamr/semantic';
import { RedisDriftCache } from './drift-cache';
import { sleep } from './compute-blame';

@Injectable()
export class ClickHouseWriterService implements OnModuleInit {
  private readonly logger = new Logger(ClickHouseWriterService.name);
  private consumer!: Consumer;
  private clickhouse!: ClickHouseClient;
  private buffer: CausalEdge[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private driftCache!: RedisDriftCache;

  async onModuleInit() {
    this.clickhouse = createClient({
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      database: process.env.CLICKHOUSE_DATABASE || 'blamr',
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

      await this.clickhouse.insert({
        table: 'causal_edges',
        values: batch,
        format: 'JSONEachRow',
      });
      this.logger.log(`Inserted ${batch.length} edges into ClickHouse`);
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
