import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { RunsModule } from './modules/runs/runs.module';
import { KeysModule } from './modules/keys/keys.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AgentsModule } from './modules/agents/agents.module';
import { LiveModule } from './modules/live/live.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { AuthGuardsModule } from './auth/auth-guards.module';
import { WorkspaceEntity } from './entities/workspace.entity';
import { ApiKeyEntity } from './entities/api-key.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { BlameReportEntity } from './entities/blame-report.entity';
import { WebhookEntity } from './entities/webhook.entity';
import { UserEntity } from './entities/user.entity';
import { WorkspaceMemberEntity } from './entities/workspace-member.entity';
import { WorkspaceInviteEntity } from './entities/workspace-invite.entity';
import { HopReplayEntity } from './entities/hop-replay.entity';
import { ReasoningTraceEntity } from './entities/reasoning-trace.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://blamr:blamr_dev@localhost:5432/blamr',
      entities: [
        WorkspaceEntity,
        ApiKeyEntity,
        WorkflowRunEntity,
        BlameReportEntity,
        WebhookEntity,
        UserEntity,
        WorkspaceMemberEntity,
        WorkspaceInviteEntity,
        HopReplayEntity,
        ReasoningTraceEntity,
      ],
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
    RunsModule,
    KeysModule,
    WorkspaceModule,
    WebhooksModule,
    WorkflowsModule,
    MetricsModule,
    AgentsModule,
    LiveModule,
    AuthModule,
    UsersModule,
    AuthGuardsModule,
    BootstrapModule,
  ],
})
export class AppModule {}
