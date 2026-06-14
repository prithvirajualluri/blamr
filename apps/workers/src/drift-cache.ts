import Redis from 'ioredis';
import type { DriftCache } from '@blamr/semantic';

export class RedisDriftCache implements DriftCache {
  constructor(private readonly client: Redis) {}

  async getRunGoal(runId: string): Promise<string | null> {
    return this.client.get(`run:${runId}:goal`);
  }

  async setRunGoal(runId: string, goal: string, ttlSec = 86_400): Promise<void> {
    await this.client.setex(`run:${runId}:goal`, ttlSec, goal);
  }

  async getEmbedding(hash: string): Promise<number[] | null> {
    const data = await this.client.get(`emb:${hash}`);
    return data ? (JSON.parse(data) as number[]) : null;
  }

  async setEmbedding(hash: string, vector: number[], ttlSec = 604_800): Promise<void> {
    await this.client.setex(`emb:${hash}`, ttlSec, JSON.stringify(vector));
  }
}
