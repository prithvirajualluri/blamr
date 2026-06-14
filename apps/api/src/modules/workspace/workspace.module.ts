import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceEntity } from '../../entities/workspace.entity';
import { ApiKeyEntity } from '../../entities/api-key.entity';
import { KeysModule } from '../keys/keys.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceEntity, ApiKeyEntity]),
    KeysModule,
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
