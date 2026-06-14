import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ApiKeyEntity } from '../entities/api-key.entity';

export interface CachedApiKey {
  id: string;
  workspace_id: string;
  scopes: string[];
  status: string;
}

@Injectable()
export class ValkeyService {
  private client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
    });
  }

  async getCachedApiKey(keyId: string): Promise<CachedApiKey | null> {
    const data = await this.client.get(`apikey:${keyId}`);
    return data ? JSON.parse(data) : null;
  }

  async setCachedApiKey(keyId: string, data: CachedApiKey, ttl = 600) {
    await this.client.setex(`apikey:${keyId}`, ttl, JSON.stringify(data));
  }

  async checkRateLimit(workspaceId: string, limit: number): Promise<boolean> {
    const key = `ratelimit:${workspaceId}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, 60);
    return count <= limit;
  }
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly keyRepo: Repository<ApiKeyEntity>,
    private readonly valkey: ValkeyService,
  ) {}

  async validateApiKey(apiKey: string | undefined): Promise<CachedApiKey | null> {
    if (!apiKey?.trim()) return null;
    const prefix = apiKey.substring(0, 14);
    const cached = await this.valkey.getCachedApiKey(prefix);
    if (cached) return cached.status === 'active' ? cached : null;

    const keyRecord = await this.keyRepo.findOne({ where: { key_prefix: prefix } });
    if (!keyRecord || keyRecord.status !== 'active') return null;

    const valid = await bcrypt.compare(apiKey, keyRecord.key_hash);
    if (!valid) return null;

    const data: CachedApiKey = {
      id: keyRecord.id,
      workspace_id: keyRecord.workspace_id,
      scopes: keyRecord.scopes,
      status: keyRecord.status,
    };

    await this.valkey.setCachedApiKey(prefix, data);
    return data;
  }
}
