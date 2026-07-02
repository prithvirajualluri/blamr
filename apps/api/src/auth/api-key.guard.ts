import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ApiKeyEntity } from '../entities/api-key.entity';
import { ValkeyService } from '../services/valkey.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
    private readonly valkey: ValkeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const keyId = apiKey.substring(0, 14).replace(/_/g, '').slice(-8) || apiKey.split('_')[2]?.substring(0, 8);
    const lookupId = apiKey.startsWith('bk_') ? apiKey.substring(0, 14) : keyId;

    const cached = await this.valkey.getCachedApiKey(lookupId);
    if (cached) {
      if (cached.status !== 'active') {
        throw new UnauthorizedException('API key revoked');
      }
      request.workspaceId = cached.workspace_id;
      request.apiKeyId = cached.id;
      request.scopes = cached.scopes;
      return true;
    }

    const prefix = apiKey.substring(0, 14);
    const keyRecord = await this.apiKeyRepo.findOne({
      where: [{ key_prefix: prefix }, { key_id: lookupId }],
    });

    if (!keyRecord || keyRecord.status !== 'active') {
      throw new UnauthorizedException('Invalid API key');
    }

    const valid = await bcrypt.compare(apiKey, keyRecord.key_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.valkey.setCachedApiKey(keyRecord.key_id, {
      id: keyRecord.id,
      workspace_id: keyRecord.workspace_id,
      scopes: keyRecord.scopes,
      status: keyRecord.status,
    });

    await this.apiKeyRepo.update(keyRecord.id, {
      last_used_at: new Date(),
      call_count: Number(keyRecord.call_count) + 1,
    });

    request.workspaceId = keyRecord.workspace_id;
    request.apiKeyId = keyRecord.id;
    request.scopes = keyRecord.scopes;
    return true;
  }
}
