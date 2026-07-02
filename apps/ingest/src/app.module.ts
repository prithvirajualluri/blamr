import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestController } from './ingest.controller';
import { KafkaService } from './services/kafka.service';
import { AuthService, ValkeyService } from './services/auth.service';
import { ApiKeyEntity } from './entities/api-key.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { ReasoningTraceEntity } from './entities/reasoning-trace.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://blamr:blamr_dev@localhost:5432/blamr',
      entities: [ApiKeyEntity, WorkflowRunEntity, ReasoningTraceEntity],
      synchronize: false,
    }),
    TypeOrmModule.forFeature([ApiKeyEntity, WorkflowRunEntity, ReasoningTraceEntity]),
  ],
  controllers: [IngestController],
  providers: [KafkaService, AuthService, ValkeyService],
})
export class AppModule {}
