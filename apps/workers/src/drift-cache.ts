import Redis from 'ioredis';
import type { DriftCache } from '@blamr/semantic';

export class RedisDriftCache implements DriftCache {
  constructor(private readonly client: Redis) {}

  async getRunSystemPrompt(runId: string): Promise<string | null> {
    return this.client.get(`run:${runId}:system_prompt`);
  }

  async getRunGoalSnapshot(runId: string): Promise<string | null> {
    return this.client.get(`run:${runId}:goal_snapshot`);
  }

  async setRunSystemPrompt(runId: string, systemPrompt: string, ttlSec = 86_400): Promise<void> {
    await this.client.setex(`run:${runId}:system_prompt`, ttlSec, systemPrompt);
  }

  async setRunGoalSnapshot(runId: string, goalSnapshot: string, ttlSec = 86_400): Promise<void> {
    await this.client.setex(`run:${runId}:goal_snapshot`, ttlSec, goalSnapshot);
  }

  async getEmbedding(hash: string): Promise<number[] | null> {
    const data = await this.client.get(`emb:${hash}`);
    return data ? (JSON.parse(data) as number[]) : null;
  }

  async setEmbedding(hash: string, vector: number[], ttlSec = 604_800): Promise<void> {
    await this.client.setex(`emb:${hash}`, ttlSec, JSON.stringify(vector));
  }
}
