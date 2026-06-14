import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowRunEntity])],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
