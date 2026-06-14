import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BootstrapService } from './bootstrap.service';
import { WorkspaceEntity } from '../entities/workspace.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceEntity])],
  providers: [BootstrapService],
})
export class BootstrapModule {}
