import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import type { CreateUserRequest, InviteUserRequest, UserRole } from '@blamr/types';

@Controller('v1/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin', 'member')
  list(@Req() req: { workspaceId: string }) {
    return this.usersService.listMembers(req.workspaceId);
  }

  @Get('invites')
  @Roles('admin')
  listInvites(@Req() req: { workspaceId: string }) {
    return this.usersService.listInvites(req.workspaceId);
  }

  @Post()
  @Roles('admin')
  create(
    @Req() req: { workspaceId: string },
    @Body() body: CreateUserRequest,
  ) {
    return this.usersService.createUser(req.workspaceId, body);
  }

  @Post('invite')
  @Roles('admin')
  invite(
    @Req() req: { workspaceId: string; user: { sub: string } },
    @Body() body: InviteUserRequest,
  ) {
    return this.usersService.inviteUser(req.workspaceId, req.user.sub, body);
  }

  @Patch(':userId/role')
  @Roles('admin')
  updateRole(
    @Req() req: { workspaceId: string; user: { sub: string } },
    @Param('userId') userId: string,
    @Body() body: { role: UserRole },
  ) {
    return this.usersService.updateRole(req.workspaceId, userId, body.role, req.user.sub);
  }

  @Delete(':userId')
  @Roles('admin')
  remove(
    @Req() req: { workspaceId: string; user: { sub: string } },
    @Param('userId') userId: string,
  ) {
    return this.usersService.removeMember(req.workspaceId, userId, req.user.sub);
  }

  @Delete('invites/:inviteId')
  @Roles('admin')
  revokeInvite(
    @Req() req: { workspaceId: string },
    @Param('inviteId') inviteId: string,
  ) {
    return this.usersService.revokeInvite(req.workspaceId, inviteId);
  }
}
