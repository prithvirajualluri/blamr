import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserEntity } from '../../entities/user.entity';
import { WorkspaceEntity } from '../../entities/workspace.entity';
import { WorkspaceMemberEntity } from '../../entities/workspace-member.entity';
import { WorkspaceInviteEntity } from '../../entities/workspace-invite.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      WorkspaceEntity,
      WorkspaceMemberEntity,
      WorkspaceInviteEntity,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
