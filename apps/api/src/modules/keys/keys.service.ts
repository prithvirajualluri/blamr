import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { ApiKeyEntity } from '../../entities/api-key.entity';
import { ValkeyService } from '../../services/valkey.service';
import type { APIScope, KeyEnvironment } from '@blamr/types';

@Injectable()
export class KeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly keyRepo: Repository<ApiKeyEntity>,
    private readonly valkey: ValkeyService,
  ) {}

  async list(workspaceId: string) {
    const keys = await this.keyRepo.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
    });
    return keys.map(({ key_hash, ...rest }) => rest);
  }

  async create(data: {
    name: string;
    environment: KeyEnvironment;
    scopes: APIScope[];
    workspace_id: string;
  }) {
    const keyId = randomBytes(4).toString('hex');
    const secret = randomBytes(16).toString('hex');
    const rawKey = `bk_${data.environment === 'live' ? 'live' : 'test'}_${keyId}${secret}`;
    const keyPrefix = rawKey.substring(0, 14);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const entity = this.keyRepo.create({
      id: uuidv4(),
      key_id: keyId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: data.name,
      workspace_id: data.workspace_id,
      environment: data.environment,
      scopes: data.scopes,
      status: 'active',
      call_count: 0,
    });

    const saved = await this.keyRepo.save(entity);
    const { key_hash, ...keyWithoutHash } = saved;

    return { key: keyWithoutHash, raw_key: rawKey };
  }

  async revoke(id: string, workspaceId: string) {
    const key = await this.keyRepo.findOne({ where: { id, workspace_id: workspaceId } });
    if (!key) throw new NotFoundException('API key not found');

    await this.keyRepo.update(id, { status: 'revoked' });
    await this.valkey.invalidateApiKey(key.key_id);
    return { revoked: true };
  }
}
