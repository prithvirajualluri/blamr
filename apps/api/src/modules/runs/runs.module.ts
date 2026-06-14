import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';
import { BlameReportEntity } from '../../entities/blame-report.entity';
import { ClickHouseService } from '../../services/clickhouse.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowRunEntity, BlameReportEntity]),
  ],
  controllers: [RunsController],
  providers: [RunsService, ClickHouseService],
  exports: [RunsService],
})
export class RunsModule {}
