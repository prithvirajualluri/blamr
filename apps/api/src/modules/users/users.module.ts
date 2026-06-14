import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserEntity } from '../../entities/user.entity';
import { WorkspaceMemberEntity } from '../../entities/workspace-member.entity';
import { WorkspaceInviteEntity } from '../../entities/workspace-invite.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      WorkspaceMemberEntity,
      WorkspaceInviteEntity,
    ]),
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
