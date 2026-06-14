import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { WorkspaceEntity } from './entities/workspace.entity';
import { ApiKeyEntity } from './entities/api-key.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { BlameReportEntity } from './entities/blame-report.entity';
import { WebhookEntity } from './entities/webhook.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://blamr:blamr_dev@localhost:5432/blamr',
  entities: [
    WorkspaceEntity,
    ApiKeyEntity,
    WorkflowRunEntity,
    BlameReportEntity,
    WebhookEntity,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
