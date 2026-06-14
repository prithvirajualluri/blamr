import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';
import { ClickHouseService } from '../../services/clickhouse.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowRunEntity])],
  controllers: [AgentsController],
  providers: [AgentsService, ClickHouseService],
})
export class AgentsModule {}
