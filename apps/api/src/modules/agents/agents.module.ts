import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { WorkflowRunEntity } from '../../entities/workflow-run.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowRunEntity])],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
