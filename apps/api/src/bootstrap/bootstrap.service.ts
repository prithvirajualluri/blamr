import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceEntity } from '../entities/workspace.entity';
import { DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_SETTINGS } from '@blamr/types';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepo: Repository<WorkspaceEntity>,
  ) {}

  async onModuleInit() {
    const existing = await this.workspaceRepo.findOne({ where: { id: DEFAULT_WORKSPACE_ID } });
    if (existing) return;

    await this.workspaceRepo.save(
      this.workspaceRepo.create({
        id: DEFAULT_WORKSPACE_ID,
        name: 'Default Workspace',
        slug: 'default',
        owner_email: '',
        plan: 'oss',
        settings: {
          ...DEFAULT_WORKSPACE_SETTINGS,
          workflow_configs: {
            'customer-support': {
              confidence_accept_level: 0.78,
              confidence_gate_mode: 'min',
              domain_type: 'support',
            },
            'incident-triage': {
              confidence_accept_level: 0.72,
              confidence_gate_mode: 'final',
              domain_type: 'incident',
            },
            'research-assistant': {
              confidence_accept_level: 0.7,
              confidence_gate_mode: 'final',
              domain_type: 'generic',
            },
          },
        },
      }),
    );
    this.logger.log('Created default workspace');
  }
}
