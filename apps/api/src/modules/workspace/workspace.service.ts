import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceEntity } from '../../entities/workspace.entity';
import { ApiKeyEntity } from '../../entities/api-key.entity';
import { KeysService } from '../keys/keys.service';
import type { WorkspaceSettings } from '@blamr/types';
import { DEFAULT_WORKSPACE_SETTINGS } from '@blamr/types';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepo: Repository<WorkspaceEntity>,
    @InjectRepository(ApiKeyEntity)
    private readonly keyRepo: Repository<ApiKeyEntity>,
    private readonly keysService: KeysService,
  ) {}

  async get(workspaceId: string) {
    const ws = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    return ws;
  }

  async updateSettings(workspaceId: string, settings: Partial<WorkspaceSettings>) {
    const ws = await this.get(workspaceId);
    const current = { ...DEFAULT_WORKSPACE_SETTINGS, ...ws.settings };
    const merged: WorkspaceSettings = { ...current, ...settings };
    if (settings.workflow_configs) {
      merged.workflow_configs = {
        ...current.workflow_configs,
        ...settings.workflow_configs,
      };
    }
    ws.settings = merged;
    return this.workspaceRepo.save(ws);
  }

  async rotateKeys(workspaceId: string) {
    const activeKeys = await this.keyRepo.find({
      where: { workspace_id: workspaceId, status: 'active' },
    });

    const newKeys = [];
    for (const oldKey of activeKeys) {
      await this.keysService.revoke(oldKey.id, workspaceId);
      const created = await this.keysService.create({
        name: `${oldKey.name} (rotated)`,
        environment: oldKey.environment,
        scopes: oldKey.scopes,
        workspace_id: workspaceId,
      });
      newKeys.push({ id: created.key.id, raw_key: created.raw_key });
    }

    return { rotated: activeKeys.length, new_keys: newKeys };
  }
}
