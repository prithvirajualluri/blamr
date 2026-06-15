import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';
import { WorkspaceEntity } from '../../entities/workspace.entity';
import { BlameReportEntity } from '../../entities/blame-report.entity';
import { ClickHouseService } from '../../services/clickhouse.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowRunEntity, WorkspaceEntity, BlameReportEntity])],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, ClickHouseService],
})
export class WorkflowsModule {}
