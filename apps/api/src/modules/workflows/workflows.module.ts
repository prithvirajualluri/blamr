import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowRunEntity])],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
})
export class WorkflowsModule {}
