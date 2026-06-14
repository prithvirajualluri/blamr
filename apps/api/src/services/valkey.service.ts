import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface CachedApiKey {
  id: string;
  workspace_id: string;
  scopes: string[];
  status: string;
}

@Injectable()
export class ValkeyService implements OnModuleDestroy {
  private client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  async getCachedApiKey(keyId: string): Promise<CachedApiKey | null> {
    const data = await this.client.get(`apikey:${keyId}`);
    return data ? JSON.parse(data) : null;
  }

  async setCachedApiKey(keyId: string, data: CachedApiKey, ttlSeconds = 600): Promise<void> {
    await this.client.setex(`apikey:${keyId}`, ttlSeconds, JSON.stringify(data));
  }

  async invalidateApiKey(keyId: string): Promise<void> {
    await this.client.del(`apikey:${keyId}`);
  }

  async checkRateLimit(workspaceId: string, limit: number): Promise<boolean> {
    const key = `ratelimit:${workspaceId}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, 60);
    }
    return count <= limit;
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  subscribe(channel: string, callback: (message: string) => void): Redis {
    const sub = this.client.duplicate();
    sub.subscribe(channel);
    sub.on('message', (_ch, msg) => callback(msg));
    return sub;
  }
}
